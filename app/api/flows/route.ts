import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingStep = {
  question: string;
  fieldName: string;
  tagName?: string;
  aiInstruction?: string;
};

/**
 * Keep `tags` (flow_id, flow_step_order, ai_instruction, field_name) in sync with a
 * flow's requiredQuestions array — each question is a step, and each step is a tag.
 * Updates rows in place by position so tag ids (and lead tag-name references) stay
 * stable across edits; trims/extends rows if the step count changed.
 */
async function syncFlowStepTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  flowId: string,
  questions: IncomingStep[]
) {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .eq('user_id', userId)
    .eq('flow_id', flowId)
    .order('flow_step_order', { ascending: true });

  const existingRows = existing || [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const name = (q.tagName || q.question || `Step ${i + 1}`).trim();
    const rowData = {
      name,
      ai_instruction: q.aiInstruction?.trim() || q.question || name,
      field_name: q.fieldName,
      flow_id: flowId,
      flow_step_order: i,
      is_pipeline_stage: true,
    };

    if (existingRows[i]) {
      await supabase.from('tags').update(rowData).eq('id', existingRows[i].id);
    } else {
      await supabase.from('tags').insert({
        user_id: userId,
        color: '#3b82f6',
        position: i,
        ...rowData,
      });
    }
  }

  // Remove any leftover step-tags if the flow now has fewer steps
  if (existingRows.length > questions.length) {
    const staleIds = existingRows.slice(questions.length).map(r => r.id);
    await supabase.from('tags').delete().in('id', staleIds);
  }
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch flows from conversation_flows table
    const { data: flows, error: flowsError } = await supabase
      .from('conversation_flows')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (flowsError) {
      console.error('Error fetching flows:', flowsError);
      return NextResponse.json({ ok: false, items: [], error: flowsError.message }, { status: 500 });
    }

    // Map database format to expected format
    const mappedFlows = (flows || []).map(flow => ({
      id: flow.id,
      name: flow.name,
      description: flow.context?.whatOffering || '',
      steps: flow.steps || [],
      createdAt: flow.created_at,
      updatedAt: flow.updated_at,
      isAIGenerated: true,
      is_active: true,
      created_at: flow.created_at,
      updated_at: flow.updated_at,
      is_ai_generated: true,
      requiredQuestions: flow.required_questions || [],
      requiresCall: flow.requires_call || false,
      autonomyMode: flow.context?.autonomyMode || 'full_auto',
      context: flow.context
    }));

    return NextResponse.json({ ok: true, items: mappedFlows });
  } catch (error: any) {
    console.error('Error in GET /api/flows:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, steps, isAIGenerated, description, requiredQuestions, requiresCall, context, autonomyMode } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Flow name is required' }, { status: 400 });
    }

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json({ ok: false, error: 'Flow steps are required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Build the context object — use provided context if available, otherwise fall back to description-only
    const baseContext = context || { whatOffering: description || '' };
    const flowContext = autonomyMode ? { ...baseContext, autonomyMode } : baseContext;

    // Create flow using conversation_flows table
    const { data, error } = await supabase
      .from('conversation_flows')
      .insert({
        user_id: user.id,
        name: name.trim(),
        context: flowContext,
        steps: steps,
        required_questions: requiredQuestions || [],
        requires_call: requiresCall || false,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating flow:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (Array.isArray(requiredQuestions) && requiredQuestions.length > 0) {
      await syncFlowStepTags(supabase, user.id, data.id, requiredQuestions);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in POST /api/flows:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, steps, isAIGenerated, description, requiredQuestions, requiresCall, context, autonomyMode } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Flow ID is required' }, { status: 400 });
    }

    // Update flow using conversation_flows table
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name.trim();
    if (context !== undefined) {
      // Use full context object if provided (includes agent identity fields)
      // If autonomyMode also provided, merge it in
      updateData.context = autonomyMode ? { ...context, autonomyMode } : context;
    } else if (autonomyMode !== undefined) {
      // autonomyMode-only update — need to fetch current context to merge
      const { data: existing } = await supabase
        .from('conversation_flows')
        .select('context')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      updateData.context = { ...(existing?.context || {}), autonomyMode };
    } else if (description !== undefined) {
      // Fallback: legacy description-only updates
      updateData.context = { whatOffering: description };
    }
    if (steps !== undefined) updateData.steps = steps;
    if (requiredQuestions !== undefined) updateData.required_questions = requiredQuestions;
    if (requiresCall !== undefined) updateData.requires_call = requiresCall;

    const { data, error } = await supabase
      .from('conversation_flows')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating flow:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (requiredQuestions !== undefined && Array.isArray(requiredQuestions)) {
      await syncFlowStepTags(supabase, user.id, id, requiredQuestions);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in PUT /api/flows:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Flow ID is required' }, { status: 400 });
    }

    // Delete flow
    const { error } = await supabase
      .from('conversation_flows')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting flow:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/flows:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

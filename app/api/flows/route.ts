import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const { id, name, steps, isAIGenerated, description, requiredQuestions, requiresCall } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Flow name is required' }, { status: 400 });
    }

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json({ ok: false, error: 'Flow steps are required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Create flow using conversation_flows table
    const { data, error } = await supabase
      .from('conversation_flows')
      .insert({
        user_id: user.id,
        name: name.trim(),
        context: { whatOffering: description || '' },
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
    const { id, name, steps, isAIGenerated, description, requiredQuestions, requiresCall } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Flow ID is required' }, { status: 400 });
    }

    // Update flow using conversation_flows table
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) {
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

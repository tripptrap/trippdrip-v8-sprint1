import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type TriggerType =
  | 'lead_created'
  | 'message_received'
  | 'message_sent'
  | 'appointment_booked'
  | 'no_response'
  | 'keyword_match'
  | 'lead_replied';

export type ActionType =
  | 'add_tag'
  | 'remove_tag'
  | 'set_primary_tag'
  | 'replace_tag';

export interface AutoTaggingRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  action_type: ActionType;
  tag_name: string;
  condition_tags: string[];
  condition_tags_mode: 'any' | 'all' | 'none';
  priority: number;
  created_at: string;
  updated_at: string;
}

// GET - Fetch all auto-tagging rules for current user
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    const { data: rules, error } = await supabase
      .from('auto_tagging_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching auto-tagging rules:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: rules || [] });
  } catch (error: any) {
    console.error('Error in GET /api/auto-tagging-rules:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

// POST - Create a new auto-tagging rule
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      trigger_type,
      trigger_config = {},
      action_type,
      tag_name,
      condition_tags = [],
      condition_tags_mode = 'any',
      priority = 100,
      enabled = true,
    } = body;

    // Validate required fields
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Rule name is required' }, { status: 400 });
    }
    if (!trigger_type) {
      return NextResponse.json({ ok: false, error: 'Trigger type is required' }, { status: 400 });
    }
    if (!action_type) {
      return NextResponse.json({ ok: false, error: 'Action type is required' }, { status: 400 });
    }
    if (!tag_name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Tag name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('auto_tagging_rules')
      .insert({
        user_id: user.id,
        name: name.trim(),
        trigger_type,
        trigger_config,
        action_type,
        tag_name: tag_name.trim(),
        condition_tags,
        condition_tags_mode,
        priority,
        enabled,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating auto-tagging rule:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in POST /api/auto-tagging-rules:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update an auto-tagging rule
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Rule ID is required' }, { status: 400 });
    }

    // Clean up the updates object
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.trigger_type !== undefined) updateData.trigger_type = updates.trigger_type;
    if (updates.trigger_config !== undefined) updateData.trigger_config = updates.trigger_config;
    if (updates.action_type !== undefined) updateData.action_type = updates.action_type;
    if (updates.tag_name !== undefined) updateData.tag_name = updates.tag_name.trim();
    if (updates.condition_tags !== undefined) updateData.condition_tags = updates.condition_tags;
    if (updates.condition_tags_mode !== undefined) updateData.condition_tags_mode = updates.condition_tags_mode;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

    const { data, error } = await supabase
      .from('auto_tagging_rules')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating auto-tagging rule:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in PUT /api/auto-tagging-rules:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Delete an auto-tagging rule
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Rule ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('auto_tagging_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting auto-tagging rule:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/auto-tagging-rules:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

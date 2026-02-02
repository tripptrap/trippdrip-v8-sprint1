import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAndEnrollDripTriggers } from "@/lib/drip/triggerEnrollment";

export const dynamic = "force-dynamic";

// GET a single lead by ID
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lead });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PATCH (update) a lead by ID
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();

    // Build update object with only provided fields
    const updateData: any = {};

    if (body.first_name !== undefined) updateData.first_name = body.first_name;
    if (body.last_name !== undefined) updateData.last_name = body.last_name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.state !== undefined) updateData.state = body.state;
    if (body.zip_code !== undefined) updateData.zip_code = body.zip_code;
    if (body.tags !== undefined) {
      console.log('Saving tags:', body.tags, 'type:', typeof body.tags, 'isArray:', Array.isArray(body.tags));
      updateData.tags = body.tags;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.disposition !== undefined) updateData.disposition = body.disposition;
    if (body.temperature !== undefined) updateData.temperature = body.temperature;
    if (body.source !== undefined) updateData.source = body.source;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.primary_tag !== undefined) updateData.primary_tag = body.primary_tag;

    updateData.updated_at = new Date().toISOString();

    // Fetch old lead data for trigger comparison
    const { data: oldLead } = await supabase
      .from('leads')
      .select('tags, status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Check drip triggers for tag additions
    if (body.tags && oldLead) {
      const oldTags: string[] = oldLead.tags || [];
      const newTags: string[] = body.tags || [];
      const addedTags = newTags.filter(t => !oldTags.includes(t));
      for (const tag of addedTags) {
        checkAndEnrollDripTriggers(supabase, user.id, params.id, 'tag_added', { tag });
      }
    }

    // Check drip triggers for status changes
    if (body.status && oldLead && body.status !== oldLead.status) {
      checkAndEnrollDripTriggers(supabase, user.id, params.id, 'status_change', { status: body.status });
    }

    return NextResponse.json({ ok: true, lead });
  } catch (error: any) {
    console.error('Error in PATCH /api/leads/[id]:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// DELETE a lead by ID
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting lead:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Lead deleted successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/leads/[id]:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

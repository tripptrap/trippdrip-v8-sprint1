import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const leadId = searchParams.get('lead_id');

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Build query
    let query = supabase
      .from('follow_ups')
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          phone,
          email,
          disposition
        )
      `)
      .eq('user_id', user.id)
      .order('due_date', { ascending: true });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    const { data: followUps, error } = await query;

    if (error) {
      console.error('Error fetching follow-ups:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: followUps || [] });
  } catch (error: any) {
    console.error('Error in GET /api/follow-ups:', error);
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
    const { lead_id, title, notes, due_date, priority, reminder_type } = body;

    if (!lead_id || !title || !due_date) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Create follow-up
    const { data, error } = await supabase
      .from('follow_ups')
      .insert({
        user_id: user.id,
        lead_id,
        title,
        notes: notes || null,
        due_date,
        priority: priority || 'medium',
        reminder_type: reminder_type || 'manual',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating follow-up:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in POST /api/follow-ups:', error);
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
    const { id, status, title, notes, due_date, priority } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Follow-up ID is required' }, { status: 400 });
    }

    // Build update object
    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (title !== undefined) updateData.title = title;
    if (notes !== undefined) updateData.notes = notes;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (priority !== undefined) updateData.priority = priority;

    const { data, error } = await supabase
      .from('follow_ups')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating follow-up:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in PUT /api/follow-ups:', error);
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
      return NextResponse.json({ ok: false, error: 'Follow-up ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('follow_ups')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting follow-up:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/follow-ups:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

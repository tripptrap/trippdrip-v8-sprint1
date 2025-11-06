import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET - Fetch notes for a lead
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'Lead ID required' }, { status: 400 });
    }

    // Fetch notes for the lead
    const { data: notes, error } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notes:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, notes: notes || [] });
  } catch (error: any) {
    console.error('Error in GET /api/leads/notes:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST - Create a new note
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, noteType, content, metadata } = body;

    if (!leadId || !content) {
      return NextResponse.json({
        ok: false,
        error: 'Lead ID and content are required'
      }, { status: 400 });
    }

    // Verify lead belongs to user
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (!lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    // Create note
    const { data: note, error } = await supabase
      .from('lead_notes')
      .insert({
        user_id: user.id,
        lead_id: leadId,
        note_type: noteType || 'note',
        content,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating note:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note });
  } catch (error: any) {
    console.error('Error in POST /api/leads/notes:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update a note
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { noteId, content, noteType, metadata } = body;

    if (!noteId || !content) {
      return NextResponse.json({
        ok: false,
        error: 'Note ID and content are required'
      }, { status: 400 });
    }

    // Update note
    const updates: any = { content };
    if (noteType) updates.note_type = noteType;
    if (metadata) updates.metadata = metadata;

    const { data: note, error } = await supabase
      .from('lead_notes')
      .update(updates)
      .eq('id', noteId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating note:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!note) {
      return NextResponse.json({ ok: false, error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, note });
  } catch (error: any) {
    console.error('Error in PUT /api/leads/notes:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Delete a note
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json({ ok: false, error: 'Note ID required' }, { status: 400 });
    }

    // Delete note
    const { error } = await supabase
      .from('lead_notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting note:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Note deleted successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/leads/notes:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

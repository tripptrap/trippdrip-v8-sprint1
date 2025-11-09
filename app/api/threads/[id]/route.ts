import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: Fetch a specific thread
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        thread: null,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const threadId = parseInt(params.id);
    if (isNaN(threadId)) {
      return NextResponse.json({
        ok: false,
        thread: null,
        error: 'Invalid thread ID'
      }, { status: 400 });
    }

    const { data: thread, error } = await supabase
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching thread:', error);
      return NextResponse.json({
        ok: false,
        thread: null,
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, thread });
  } catch (error: any) {
    console.error('Error in GET /api/threads/[id]:', error);
    return NextResponse.json({
      ok: false,
      thread: null,
      error: error.message
    }, { status: 500 });
  }
}

// PUT: Update a specific thread
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const threadId = parseInt(params.id);
    if (isNaN(threadId)) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid thread ID'
      }, { status: 400 });
    }

    const body = await req.json();
    const { flow_config } = body;

    const { data: thread, error } = await supabase
      .from('threads')
      .update({ flow_config })
      .eq('id', threadId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating thread:', error);
      return NextResponse.json({
        ok: false,
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, thread });
  } catch (error: any) {
    console.error('Error in PUT /api/threads/[id]:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

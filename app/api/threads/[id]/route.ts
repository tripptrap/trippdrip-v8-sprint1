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

    const threadId = params.id;
    if (!threadId) {
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

    const threadId = params.id;
    if (!threadId) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid thread ID'
      }, { status: 400 });
    }

    const body = await req.json();
    const { ai_enabled, status } = body;

    const updatePayload: Record<string, unknown> = {};

    // `threads.ai_enabled` does not exist — the column is `ai_disabled`, with
    // the opposite polarity (#109). This wrote the request value straight
    // through under the wrong name, so PostgREST answered PGRST204 and the
    // endpoint returned 500 for every caller that tried to toggle AI.
    //
    // The request field keeps its name: `ai_enabled: true` is the natural thing
    // for a caller to send, and the two live togglers (`threads/bulk-ai-toggle`
    // and `threads/manage`) already speak in terms of enabling. Only the column
    // written changes — and the inversion is the reason this could not simply be
    // renamed. Writing `ai_enabled: false` to a column called `ai_disabled`
    // would have turned the AI ON for a caller asking to switch it off.
    if (ai_enabled !== undefined) updatePayload.ai_disabled = !ai_enabled;
    if (status !== undefined) updatePayload.status = status;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nothing to update — pass ai_enabled or status' },
        { status: 400 }
      );
    }

    // `.select()` without `.single()`, then an explicit length check.
    //
    // `.single()` errors when the update matches no row — a thread that does not
    // exist, or belongs to another account — and that error surfaced as a 500
    // with a PostgREST message. "Not yours" is a 404, not a server fault; the
    // same distinction #110 and #115 fixed across the other thread routes.
    const { data: updated, error } = await supabase
      .from('threads')
      .update(updatePayload)
      .eq('id', threadId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Error updating thread:', error);
      return NextResponse.json({
        ok: false,
        error: error.message
      }, { status: 500 });
    }

    if (!updated?.length) {
      return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, thread: updated[0] });
  } catch (error: any) {
    console.error('Error in PUT /api/threads/[id]:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

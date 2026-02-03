import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, dripId } = body;

    if (!threadId && !dripId) {
      return NextResponse.json({ success: false, error: 'threadId or dripId is required' }, { status: 400 });
    }

    // Build the query
    let query = supabase
      .from('ai_drips')
      .update({ status: 'stopped', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (dripId) {
      query = query.eq('id', dripId);
    } else {
      query = query.eq('thread_id', threadId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('Error stopping AI drip:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: 'No active drip found' }, { status: 404 });
    }

    // Cancel any scheduled messages for this drip
    if (data[0]?.id) {
      await supabase
        .from('ai_drip_messages')
        .update({ status: 'cancelled' })
        .eq('drip_id', data[0].id)
        .eq('status', 'scheduled');
    }

    return NextResponse.json({
      success: true,
      message: 'Drip stopped successfully',
      stoppedCount: data.length,
    });

  } catch (error: any) {
    console.error('AI drip stop error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

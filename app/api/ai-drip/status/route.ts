import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId');
    const dripId = searchParams.get('dripId');

    if (!threadId && !dripId) {
      return NextResponse.json({ success: false, error: 'threadId or dripId is required' }, { status: 400 });
    }

    // Build the query
    let query = supabase
      .from('ai_drips')
      .select('*')
      .eq('user_id', user.id);

    if (dripId) {
      query = query.eq('id', dripId);
    } else {
      query = query.eq('thread_id', threadId).eq('status', 'active');
    }

    const { data: drip, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching AI drip status:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!drip) {
      return NextResponse.json({
        success: true,
        active: false,
        drip: null,
      });
    }

    // Calculate time until next send
    let timeUntilNext: string | null = null;
    if (drip.next_send_at) {
      const now = new Date();
      const nextSend = new Date(drip.next_send_at);
      const diffMs = nextSend.getTime() - now.getTime();

      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          timeUntilNext = `${hours}h ${minutes}m`;
        } else {
          timeUntilNext = `${minutes}m`;
        }
      } else {
        timeUntilNext = 'Processing...';
      }
    }

    // Get scheduled messages for this drip
    const { data: scheduledMessages } = await supabase
      .from('ai_drip_messages')
      .select('id, content, scheduled_for, status, sent_at')
      .eq('drip_id', drip.id)
      .order('scheduled_for', { ascending: true });

    return NextResponse.json({
      success: true,
      active: drip.status === 'active',
      drip: {
        id: drip.id,
        status: drip.status,
        intervalHours: drip.interval_hours,
        maxMessages: drip.max_messages,
        messagesSent: drip.messages_sent,
        startedAt: drip.started_at,
        expiresAt: drip.expires_at,
        nextSendAt: drip.next_send_at,
        timeUntilNext,
        lastError: drip.last_error,
      },
      scheduledMessages: scheduledMessages || [],
    });

  } catch (error: any) {
    console.error('AI drip status error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

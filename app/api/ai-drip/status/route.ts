// API Route: Get AI Drip Status
// Returns the status of an AI drip for a thread

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch (authErr) {
      console.error('Auth error:', authErr);
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId');
    const dripId = searchParams.get('dripId');

    if (!threadId && !dripId) {
      return NextResponse.json({ success: false, error: 'Thread ID or Drip ID required' }, { status: 400 });
    }

    let query = supabase
      .from('ai_drips')
      .select('*')
      .eq('user_id', user.id);

    if (dripId) {
      query = query.eq('id', dripId);
    } else if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    // Get the most recent drip (could be active or completed)
    const { data: drips, error } = await query
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching AI drip status:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const drip = drips?.[0];

    if (!drip) {
      return NextResponse.json({
        success: true,
        active: false,
        drip: null
      });
    }

    // Calculate time until next send
    let timeUntilNext = null;
    if (drip.status === 'active' && drip.next_send_at) {
      const nextSend = new Date(drip.next_send_at);
      const now = new Date();
      const diffMs = nextSend.getTime() - now.getTime();
      if (diffMs > 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeUntilNext = `${diffHours}h ${diffMins}m`;
      } else {
        timeUntilNext = 'Processing...';
      }
    }

    // Fetch scheduled messages for this drip
    const { data: scheduledMessages } = await supabase
      .from('ai_drip_messages')
      .select('*')
      .eq('drip_id', drip.id)
      .order('message_number', { ascending: true });

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
      scheduledMessages: (scheduledMessages || []).map(m => ({
        id: m.id,
        messageNumber: m.message_number,
        content: m.content,
        scheduledFor: m.scheduled_for,
        status: m.status,
        sentAt: m.sent_at,
      }))
    });

  } catch (error: any) {
    console.error('Error fetching AI drip status:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

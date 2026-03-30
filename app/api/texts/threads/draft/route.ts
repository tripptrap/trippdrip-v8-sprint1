// API Route: Approve or dismiss a pending AI draft on a thread
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId, action } = await req.json();

    if (!threadId || !action) {
      return NextResponse.json({ ok: false, error: 'threadId and action are required' }, { status: 400 });
    }

    if (!['approve', 'dismiss'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'action must be approve or dismiss' }, { status: 400 });
    }

    // Fetch the thread to get the draft and verify ownership
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select('id, pending_ai_draft, phone_number, lead_id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ ok: false, error: 'Thread not found' }, { status: 404 });
    }

    if (!thread.pending_ai_draft) {
      return NextResponse.json({ ok: false, error: 'No pending draft on this thread' }, { status: 404 });
    }

    if (action === 'dismiss') {
      // Clear the draft without sending
      await supabase
        .from('threads')
        .update({ pending_ai_draft: null })
        .eq('id', threadId)
        .eq('user_id', user.id);

      return NextResponse.json({ ok: true, action: 'dismissed' });
    }

    // action === 'approve': send the draft via SMS and clear it
    const draftText = thread.pending_ai_draft;

    // Get user's primary Telnyx number
    const { data: primaryNumber } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single();

    const fromNumber = primaryNumber?.phone_number;
    if (!fromNumber) {
      return NextResponse.json({ ok: false, error: 'No primary phone number configured' }, { status: 400 });
    }

    // Send the SMS
    const sendRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: thread.lead_id,
        to: thread.phone_number,
        from: fromNumber,
        message: draftText,
        threadId,
        isAutomated: false, // User approved it — counts as manual send
      }),
    });

    const sendData = await sendRes.json();
    if (!sendData.ok && !sendData.success) {
      return NextResponse.json({ ok: false, error: sendData.error || 'Failed to send message' }, { status: 500 });
    }

    // Clear the draft
    await supabase
      .from('threads')
      .update({ pending_ai_draft: null })
      .eq('id', threadId)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true, action: 'approved', messageSent: true });

  } catch (error: any) {
    console.error('Draft action error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

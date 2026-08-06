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
      const { data: dismissed, error: dismissError } = await supabase
        .from('threads')
        .update({ pending_ai_draft: null })
        .eq('id', threadId)
        .eq('user_id', user.id)
        .select('id');
      // Checked, not silent (#115): if the draft is not actually cleared it
      // stays on the thread and can be approved again later.
      if (dismissError || !dismissed?.length) {
        console.error(
          `Draft dismiss did not clear thread ${threadId} for user ${user.id}:`,
          dismissError?.message ?? 'no rows matched'
        );
        return NextResponse.json(
          { ok: false, error: 'Could not dismiss the draft' },
          { status: dismissError ? 500 : 404 }
        );
      }

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

    // Send the SMS.
    //
    // The session is forwarded (#146). This is a server-to-server fetch, which
    // carries no cookies of its own, and /api/sms/send authenticates with
    // supabase.auth.getUser() — cookie-based, and unlike /api/telnyx/send-sms it
    // has no internal-secret path. So this request arrived anonymous and the
    // route answered 401: approving a draft has never once sent a message.
    //
    // Forwarding the caller's cookie rather than adding an internal-secret path
    // is deliberate. /api/telnyx/send-sms wraps its ENTIRE credit block in
    // `if (!internalCaller)`, so an internal caller is not charged — and this is
    // a user pressing send on a message they reviewed. It must cost a credit and
    // must be subject to every guard a typed message is. Running it as the user
    // gets both for free.
    const cookieHeader = req.headers.get('cookie');
    const sendRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        leadId: thread.lead_id,
        to: thread.phone_number,
        from: fromNumber,
        message: draftText,
        threadId,
        isAutomated: false, // User approved it — counts as manual send
      }),
    });

    // Read the status as well as the body. /api/sms/send answers 401 with
    // `{ error }` and no `ok`/`success` key, so the old check happened to catch
    // it — but a route that returned an empty body or a differently-shaped error
    // would have read as a success and cleared the draft on a message that never
    // went out.
    const sendData = await sendRes.json().catch(() => ({} as any));
    if (!sendRes.ok || (!sendData.ok && !sendData.success)) {
      console.error(
        `Draft approve: send failed for thread ${threadId} (HTTP ${sendRes.status}):`,
        sendData.error || '(no error body)'
      );
      return NextResponse.json(
        { ok: false, error: sendData.error || `Failed to send message (HTTP ${sendRes.status})` },
        { status: 500 }
      );
    }

    // Clear the draft
    // The SMS has already gone out, so a failure here is NOT reported as a
    // failed request — but it must be loud. An uncleared draft can be approved
    // a second time, which sends the same message to the same person again
    // (#115).
    const { data: cleared, error: clearError } = await supabase
      .from('threads')
      .update({ pending_ai_draft: null })
      .eq('id', threadId)
      .eq('user_id', user.id)
      .select('id');
    if (clearError || !cleared?.length) {
      console.error(
        `⚠️ Sent the draft for thread ${threadId} but could not clear it (${clearError?.message ?? 'no rows matched'}) — it can be approved again and re-sent.`
      );
    }

    return NextResponse.json({
      ok: true,
      action: 'approved',
      messageSent: true,
      draftCleared: !clearError && !!cleared?.length,
    });

  } catch (error: any) {
    console.error('Draft action error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

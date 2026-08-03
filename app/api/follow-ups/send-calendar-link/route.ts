import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { exemptFromModeration } from '@/lib/smsModeration';
import { resolveFromNumber } from '@/lib/resolveFromNumber';
import { sendTelnyxSMS } from '@/lib/telnyx';

// Credit changes run on the service-role client, never the caller's (#114).
//
// add_credits and deduct_credits are SECURITY DEFINER and were granted to
// `authenticated`. Their guard only stops you acting on ANOTHER user — acting on
// your own id was permitted, so any logged-in user could POST
// /rest/v1/rpc/add_credits with their own id and mint credits. Verified: a test
// account went 0 -> 999,999 in one request. Credits are what the point packs
// sell, so that was revenue, not just data.
//
// EXECUTE is revoked from authenticated; these calls run as service_role. The
// user id still comes from the verified session.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, followUpId, calendarType = 'calendly' } = body;

    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'Lead ID is required' }, { status: 400 });
    }

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone, state, zip_code')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.phone) {
      return NextResponse.json({ ok: false, error: 'Lead has no phone number' }, { status: 400 });
    }

    // Opt-out, suspension and rate gate (#123).
    //
    // This route had **none** of them. It calls the Telnyx API directly instead
    // of going through sendTelnyxSMS, and it is not in `follow-ups` or any cron,
    // so every previous sweep of "the send paths" missed it — #40 (DNC), #50
    // (quiet hours), #121 (suspension and rate caps) and #122 (from-number
    // resolution) each enumerated eight paths and this was the ninth. A lead who
    // texted STOP still received a calendar link from here.
    //
    // Placed before the message is built, sent, or charged for.
    //
    // Quiet hours off: a user pressing "send calendar link" is a deliberate act,
    // the same rule manual sends follow (#50).
    const guard = await checkSmsAllowed(createServiceRoleClient(), user.id, lead.phone, {
      recipientState: lead.state,
      context: { source: 'follow_up_calendar_link', lead_id: lead.id, follow_up_id: followUpId ?? null },
    });

    if (!guard.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: guard.detail || 'Message blocked',
          reason: guard.reason,
          retryable: !!guard.retryable,
          on_dnc_list: guard.reason === 'dnc',
        },
        { status: guard.reason === 'rate_limited' ? 429 : 403 }
      );
    }

    // Get user's preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('calendar_booking_url, calendar_type')
      .eq('user_id', user.id)
      .single();

    const calendlyUrl = prefs?.calendar_booking_url;
    const effectiveType = calendarType || prefs?.calendar_type || 'calendly';

    // Shared resolver (#122) rather than a blind is_primary lookup, which
    // ignored geo-routing and — more importantly — sent from numbers the user
    // had locked or rested. Resting a number is pointless if a send path keeps
    // using it.
    const resolved = await resolveFromNumber(createServiceRoleClient(), user.id, {
      leadZipCode: lead.zip_code ?? null,
      toPhone: lead.phone,
    });

    if (!resolved.ok) {
      // Was a single "No phone number configured for sending", which is the
      // wrong thing to tell someone whose lookup merely failed (#125).
      return NextResponse.json(
        { ok: false, error: resolved.detail, reason: resolved.reason, retryable: resolved.retryable },
        { status: resolved.retryable ? 503 : 400 }
      );
    }
    const fromNumber = resolved.number;

    // Build the message based on calendar type
    const firstName = lead.first_name || '';
    let messageBody = '';

    if (effectiveType === 'google' || effectiveType === 'both') {
      // Fetch Google Calendar slots
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const slotsResponse = await fetch(`${baseUrl}/api/calendar/get-slots`, {
          headers: {
            'Cookie': req.headers.get('cookie') || '',
          },
        });

        const slotsData = await slotsResponse.json();

        if (slotsData.slots && slotsData.slots.length > 0) {
          const slotsList = slotsData.slots
            .slice(0, 3)
            .map((slot: any, i: number) => `${i + 1}. ${slot.formatted}`)
            .join('\n');

          if (effectiveType === 'both' && calendlyUrl) {
            messageBody = `Hi${firstName ? ` ${firstName}` : ''}! Here are some times I'm available:\n\n${slotsList}\n\nOr book directly: ${calendlyUrl}\n\nReply with a number or use the link!`;
          } else {
            messageBody = `Hi${firstName ? ` ${firstName}` : ''}! Here are some times I'm available:\n\n${slotsList}\n\nReply with a number to confirm!`;
          }
        } else {
          // No slots available, fall back to calendly if available
          if (calendlyUrl) {
            messageBody = `Hi${firstName ? ` ${firstName}` : ''}! Book a time to chat: ${calendlyUrl}`;
          } else {
            return NextResponse.json({
              ok: false,
              error: 'No calendar slots available and no booking URL configured'
            }, { status: 400 });
          }
        }
      } catch (error) {
        console.error('Error fetching calendar slots:', error);
        // Fall back to calendly if Google fails
        if (calendlyUrl) {
          messageBody = `Hi${firstName ? ` ${firstName}` : ''}! Book a time to chat: ${calendlyUrl}`;
        } else {
          return NextResponse.json({
            ok: false,
            error: 'Could not fetch calendar slots'
          }, { status: 500 });
        }
      }
    } else {
      // Calendly only
      if (!calendlyUrl) {
        return NextResponse.json({
          ok: false,
          error: 'No calendar booking URL configured. Please add one in Follow-ups settings.'
        }, { status: 400 });
      }
      messageBody = `Hi${firstName ? ` ${firstName}` : ''}! Here's a link to schedule a time to chat: ${calendlyUrl}`;
    }

    // Through the shared helper rather than a hand-rolled fetch, so this path
    // is visible to anything that inspects sends in future (#123).
    //
    // Exempt from scoring: the body is our own template — a greeting, and either
    // the user's booking URL or slots read from their calendar. There is no
    // user-authored prose here to moderate.
    const sendResult = await sendTelnyxSMS({
      to: lead.phone,
      from: fromNumber,
      message: messageBody,
      moderation: exemptFromModeration('system_message'),
    });

    if (!sendResult.success) {
      console.error('Telnyx error:', sendResult.error);
      return NextResponse.json({ ok: false, error: 'Failed to send SMS' }, { status: 500 });
    }

    // Log the message. Columns verified against the live schema (#53) — the
    // table uses from_phone/to_phone/message_sid, not
    // from_number/to_number/telnyx_message_id, so this insert was being
    // rejected outright and calendar links never appeared in the thread.
    const { error: msgInsertError } = await supabase.from('messages').insert({
      user_id: user.id,
      lead_id: leadId,
      from_phone: fromNumber,
      to_phone: lead.phone,
      content: messageBody,
      body: messageBody,
      direction: 'outbound',
      status: 'sent',
      channel: 'sms',
      message_sid: sendResult.messageSid,
    });

    if (msgInsertError) {
      console.error(`❌ Sent calendar link to lead ${leadId} but failed to record it:`, msgInsertError);
    }

    // Deduct credits (1 segment = 2 credits)
    const segments = Math.ceil(messageBody.length / 160);
    const creditsCost = segments * 2;

    // The parameter is `user_id`, not `user_id_param` — PostgREST matches RPC
    // arguments by NAME, so the old spelling failed even once the function
    // existed (#90). The SMS has already gone out above, so a failure here
    // can't be undone; it must be loud rather than silent.
    const { error: deductError } = await createServiceRoleClient().rpc('deduct_credits', {
      user_id: user.id,
      amount: creditsCost,
    });
    if (deductError) {
      console.error(`❌ Calendar link sent to lead ${leadId} but ${creditsCost} credits NOT deducted for user ${user.id}:`, deductError);
    }

    // If followUpId provided, mark it as completed
    if (followUpId) {
      const { data: existingFollowUp } = await supabase
        .from('follow_ups')
        .select('notes')
        .eq('id', followUpId)
        .eq('user_id', user.id)
        .single();

      const currentNotes = existingFollowUp?.notes || '';
      const typeLabel = effectiveType === 'both' ? 'Google + Calendly' : effectiveType === 'google' ? 'Google Calendar' : 'Calendly';
      const updatedNotes = currentNotes
        ? `${currentNotes}\n[${typeLabel} link sent ${new Date().toLocaleString()}]`
        : `[${typeLabel} link sent ${new Date().toLocaleString()}]`;

      // The calendar link has already been sent. A failure to mark the
      // follow-up complete leaves it due, so it gets actioned again and the
      // contact receives the link twice (#115).
      const { data: completed, error: completeError } = await supabase
        .from('follow_ups')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: updatedNotes
        })
        .eq('id', followUpId)
        .eq('user_id', user.id)
        .select('id');
      if (completeError || !completed?.length) {
        console.error(
          `⚠️ Sent the calendar link but could not complete follow-up ${followUpId} (${completeError?.message ?? 'no rows matched'}) — it will come due again.`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Calendar link sent successfully',
      creditsCost,
      calendarType: effectiveType,
    });

  } catch (error: any) {
    console.error('Error sending calendar link:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

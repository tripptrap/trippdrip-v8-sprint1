import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

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
      .select('id, first_name, last_name, phone')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.phone) {
      return NextResponse.json({ ok: false, error: 'Lead has no phone number' }, { status: 400 });
    }

    // Get user's preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('calendar_booking_url, calendar_type')
      .eq('user_id', user.id)
      .single();

    const calendlyUrl = prefs?.calendar_booking_url;
    const effectiveType = calendarType || prefs?.calendar_type || 'calendly';

    // Get user's Telnyx number
    const { data: telnyxNumber, error: telnyxError } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single();

    if (telnyxError || !telnyxNumber) {
      return NextResponse.json({ ok: false, error: 'No phone number configured for sending' }, { status: 400 });
    }

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

    // Send via Telnyx
    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: telnyxNumber.phone_number,
        to: lead.phone,
        text: messageBody,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
      }),
    });

    const telnyxData = await telnyxResponse.json();

    if (!telnyxResponse.ok) {
      console.error('Telnyx error:', telnyxData);
      return NextResponse.json({ ok: false, error: 'Failed to send SMS' }, { status: 500 });
    }

    // Log the message. Columns verified against the live schema (#53) — the
    // table uses from_phone/to_phone/message_sid, not
    // from_number/to_number/telnyx_message_id, so this insert was being
    // rejected outright and calendar links never appeared in the thread.
    const { error: msgInsertError } = await supabase.from('messages').insert({
      user_id: user.id,
      lead_id: leadId,
      from_phone: telnyxNumber.phone_number,
      to_phone: lead.phone,
      content: messageBody,
      body: messageBody,
      direction: 'outbound',
      status: 'sent',
      channel: 'sms',
      message_sid: telnyxData.data?.id,
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

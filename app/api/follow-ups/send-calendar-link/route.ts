import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Log the message
    await supabase.from('messages').insert({
      user_id: user.id,
      lead_id: leadId,
      from_number: telnyxNumber.phone_number,
      to_number: lead.phone,
      body: messageBody,
      direction: 'outbound',
      status: 'sent',
      channel: 'sms',
      telnyx_message_id: telnyxData.data?.id,
    });

    // Deduct credits (1 segment = 2 credits)
    const segments = Math.ceil(messageBody.length / 160);
    const creditsCost = segments * 2;

    await supabase.rpc('deduct_credits', {
      user_id_param: user.id,
      amount: creditsCost
    });

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

      await supabase
        .from('follow_ups')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: updatedNotes
        })
        .eq('id', followUpId)
        .eq('user_id', user.id);
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

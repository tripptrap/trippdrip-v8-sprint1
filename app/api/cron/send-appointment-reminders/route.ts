import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendTelnyxSMS } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Timing-safe comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Get current hour in US Eastern time (handles EST/EDT automatically)
function getEasternHour(date: Date = new Date()): number {
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(date);
  return parseInt(eastern, 10);
}

// Quiet hours: 9pm-9am Eastern
function isInQuietHours(): boolean {
  const hour = getEasternHour();
  return hour >= 21 || hour < 9;
}

// Format a date to a human-readable time string in Eastern time
function formatAppointmentTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

/**
 * Send Appointment Reminders
 * Finds calendar_events with start_time in the next 24 hours
 * and sends SMS reminders to the associated leads.
 */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    // Authenticate cron requests (MANDATORY)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const providedSecret = authHeader.replace('Bearer ', '');
    if (!secureCompare(providedSecret, cronSecret)) {
      console.error('Invalid or missing cron secret');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Enforce quiet hours — mark as rescheduled instead of sending
    if (isInQuietHours()) {
      return NextResponse.json({
        ok: true,
        message: 'Quiet hours — skipping appointment reminders',
        sent: 0,
        skipped: 0,
        errors: 0,
      });
    }

    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Fetch calendar events starting in the next 24 hours that haven't been reminded
    const { data: events, error: fetchError } = await supabaseAdmin
      .from('calendar_events')
      .select('*')
      .gte('start_time', now.toISOString())
      .lte('start_time', twentyFourHoursFromNow.toISOString())
      .is('reminder_sent_at', null)
      .or('reminder_status.eq.pending,reminder_status.is.null')
      .order('start_time', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching calendar events:', fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ ok: true, message: 'No upcoming appointments to remind', sent: 0, skipped: 0, errors: 0 });
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Determine lead phone number
        let leadPhone = event.lead_phone;
        let leadName = '';

        // Look up lead info if we have a lead_id
        if (event.lead_id) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('id, phone, first_name, last_name')
            .eq('id', event.lead_id)
            .single();

          if (lead) {
            leadName = lead.first_name || '';
            if (!leadPhone && lead.phone) {
              leadPhone = lead.phone;
            }
          }
        }

        // Skip if no phone number available
        if (!leadPhone) {
          console.warn(`Appointment reminder: No phone number for event ${event.id}`);
          await supabaseAdmin
            .from('calendar_events')
            .update({ reminder_status: 'skipped_no_phone' })
            .eq('id', event.id);
          skipped++;
          continue;
        }

        // Get user's primary Telnyx number for sending
        const { data: userNumber } = await supabaseAdmin
          .from('user_telnyx_numbers')
          .select('phone_number')
          .eq('user_id', event.user_id)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (!userNumber?.phone_number) {
          console.error(`Appointment reminder: No Telnyx number for user ${event.user_id}`);
          await supabaseAdmin
            .from('calendar_events')
            .update({ reminder_status: 'skipped_no_from_number' })
            .eq('id', event.id);
          skipped++;
          continue;
        }

        const fromNumber = userNumber.phone_number;

        // Format the appointment time
        const appointmentTime = formatAppointmentTime(new Date(event.start_time));

        // Build reminder message
        const greeting = leadName ? `Hi ${leadName}!` : 'Hi!';
        const message = `${greeting} Just a reminder about your appointment tomorrow at ${appointmentTime}. Reply RESCHEDULE to change the time or CANCEL to cancel.`;

        // Send via Telnyx
        const sendResult = await sendTelnyxSMS({
          to: leadPhone,
          message,
          from: fromNumber,
        });

        if (!sendResult.success) {
          console.error(`Appointment reminder: Failed to send to ${leadPhone}:`, sendResult.error);
          await supabaseAdmin
            .from('calendar_events')
            .update({ reminder_status: 'error' })
            .eq('id', event.id);
          errors++;
          continue;
        }

        // Update the calendar event with reminder status
        await supabaseAdmin
          .from('calendar_events')
          .update({
            reminder_sent_at: new Date().toISOString(),
            reminder_status: 'sent',
          })
          .eq('id', event.id);

        // Log the message to the messages table
        // Find or reference the thread for this lead
        let threadId: string | null = null;
        if (event.lead_id && event.user_id) {
          const { data: existingThread } = await supabaseAdmin
            .from('threads')
            .select('id')
            .eq('user_id', event.user_id)
            .eq('lead_id', event.lead_id)
            .single();

          if (existingThread) {
            threadId = existingThread.id;
          }
        }

        if (threadId) {
          await supabaseAdmin.from('messages').insert({
            thread_id: threadId,
            body: message,
            direction: 'outbound',
            status: 'sent',
            from_number: fromNumber,
            to_number: leadPhone,
            is_automated: true,
            created_at: new Date().toISOString(),
          });
        }

        sent++;
        console.log(`Appointment reminder sent for event ${event.id} to ${leadPhone}`);

        // Small delay between sends
        await new Promise(r => setTimeout(r, 100));

      } catch (err) {
        console.error(`Appointment reminder: Error processing event ${event.id}:`, err);
        errors++;
      }
    }

    console.log(`Appointment reminders cron: sent=${sent}, skipped=${skipped}, errors=${errors}`);

    return NextResponse.json({
      ok: true,
      sent,
      skipped,
      errors,
    });

  } catch (error: any) {
    console.error('Error in appointment reminders cron:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/cron/send-appointment-reminders',
    description: 'Sends SMS reminders for upcoming appointments within the next 24 hours',
    method: 'POST to trigger processing',
  });
}

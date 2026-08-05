import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelnyxSMS } from '@/lib/telnyx';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { exemptFromModeration } from '@/lib/smsModeration';
import { alertAdminsThrottled } from '@/lib/alerting';
import { requireCronAuth } from '@/lib/cronAuth';
import { resolveFromNumber } from '@/lib/resolveFromNumber';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Timing-safe comparison to prevent timing attacks

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
async function handleCron(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    const denied = await requireCronAuth(req);
    if (denied) return denied;

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
      await alertAdminsThrottled({
        key: 'cron_fetch_failed:send-appointment-reminders',
        title: 'Appointment reminders are not being sent',
        body: `The reminder cron cannot read upcoming calendar events (${fetchError.message}). Leads with appointments in the next 24h are not being reminded, and a missed reminder cannot be sent late.`,
        data: { route: 'cron/send-appointment-reminders', error: fetchError.message },
      });
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
        let leadState: string | null = null;
        let leadName = '';

        // Look up lead info if we have a lead_id
        if (event.lead_id) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('id, phone, first_name, last_name, state')
            .eq('id', event.lead_id)
            .single();

          if (lead) {
            leadName = lead.first_name || '';
            leadState = lead.state ?? null;
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

        // Shared resolver (#122) — this took whichever number was created first,
        // ignoring the primary flag, geo, locks and rests alike.
        const resolved = await resolveFromNumber(supabaseAdmin, event.user_id, {
          leadZipCode: null,
          toPhone: leadPhone,
        });

        if (!resolved.ok) {
          console.error(`Appointment reminder: no sending number for user ${event.user_id} — ${resolved.reason}`);
          // Only a permanent cause may mark the event. Stamping
          // reminder_status on a transient lookup failure would drop the
          // reminder for good, since nothing re-sends a marked event — the same
          // distinction the guard block below already respects (#125).
          if (!resolved.retryable) {
            await supabaseAdmin
              .from('calendar_events')
              .update({ reminder_status: 'skipped_no_from_number' })
              .eq('id', event.id);
          }
          skipped++;
          continue;
        }

        const fromNumber = resolved.number;

        // Format the appointment time
        const appointmentTime = formatAppointmentTime(new Date(event.start_time));

        // Build reminder message
        const greeting = leadName ? `Hi ${leadName}!` : 'Hi!';
        const message = `${greeting} Just a reminder about your appointment tomorrow at ${appointmentTime}. Reply RESCHEDULE to change the time or CANCEL to cancel.`;

        // Opt-out gate (#40) — this cron previously sent with no DNC check at
        // all, so a lead who texted STOP kept getting reminders every run.
        const guard = await checkSmsAllowed(supabaseAdmin, event.user_id, leadPhone, {
          enforceQuietHours: true,
          recipientState: leadState,
          context: { source: 'appointment_reminder', calendar_event_id: event.id },
        });

        if (!guard.allowed) {
          console.log(`Appointment reminder: skipping ${leadPhone} — ${guard.reason} (${guard.detail})`);
          // Only mark the event when the block is permanent. A quiet-hours
          // deferral must stay unmarked so the next run can still send it —
          // this cron runs every 2 hours, so it will retry inside the window.
          if (!guard.retryable) {
            await supabaseAdmin
              .from('calendar_events')
              .update({ reminder_status: `skipped_${guard.reason}` })
              .eq('id', event.id);
          }
          skipped++;
          continue;
        }

        // Charge credits (#45). Reminders are SMS and cost 1pt like any other
        // send; this path never charged. Treating them as billable keeps the
        // out-of-credits blocker meaningful — otherwise a user at zero credits
        // still generates outbound traffic.
        const { data: creditRow } = await supabaseAdmin
          .from('users')
          .select('credits')
          .eq('id', event.user_id)
          .single();

        if (!creditRow || (creditRow.credits ?? 0) < 1) {
          console.log(`Appointment reminder: user ${event.user_id} is out of credits — skipping event ${event.id}`);
          skipped++;
          continue;
        }

        const { error: deductError } = await supabaseAdmin.rpc('deduct_credits', {
          user_id: event.user_id,
          amount: 1,
          reason: 'Appointment reminder',
        });

        if (deductError) {
          console.error(`Appointment reminder: failed to deduct credits for user ${event.user_id} — not sending:`, deductError);
          errors++;
          continue;
        }

        // #71: claim the event BEFORE sending. reminder_sent_at was set after,
        // so a failed update left it null and the reminder went out again on
        // every run — every 2 hours, indefinitely. Conditional on it still
        // being null, so concurrent runs can't both take it.
        const { data: claimedEvent, error: claimError } = await supabaseAdmin
          .from('calendar_events')
          .update({ reminder_sent_at: new Date().toISOString(), reminder_status: 'sending' })
          .eq('id', event.id)
          .is('reminder_sent_at', null)
          .select('id')
          .maybeSingle();

        if (claimError || !claimedEvent) {
          console.log(`Appointment reminder: could not claim event ${event.id} — skipping to avoid a duplicate`);
          skipped++;
          continue;
        }

        // Send via Telnyx
        const sendResult = await sendTelnyxSMS({
          to: leadPhone,
          message,
          from: fromNumber,
          // Our own fixed template — only the lead's name and the appointment
          // time are interpolated, so there is no user-authored text to score.
          // Transactional, and the recipient has an actual appointment booked:
          // a dropped reminder is worse than an unscored one (#123).
          moderation: exemptFromModeration('system_message'),
        });

        if (!sendResult.success) {
          // reminder_sent_at was set by the claim above, so this won't retry.
          // Deliberate (#71/#44): a missed reminder is cheaper than texting the
          // lead every 2 hours forever. Clearing reminder_sent_at here would
          // restore retries and reintroduce the loop, so it's left set and the
          // failure is recorded in reminder_status for visibility.
          console.error(`Appointment reminder: Failed to send to ${leadPhone} (will not retry):`, sendResult.error);
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
          // Columns verified against the live schema (#53) — the table uses
          // from_phone/to_phone, not from_number/to_number. The old names made
          // Postgres reject the whole insert, so reminders were sent but never
          // recorded in the thread.
          const { error: msgInsertError } = await supabaseAdmin.from('messages').insert({
            thread_id: threadId,
            user_id: event.user_id,
            content: message,
            body: message,
            direction: 'outbound',
            status: 'sent',
            from_phone: fromNumber,
            to_phone: leadPhone,
            is_automated: true,
            automation_source: 'appointment_reminder',
            // The delivery webhook matches on `.eq('message_sid', ...)`, so
            // without it this row is stuck at 'sent' for ever — 'delivered' and
            // 'failed' never land, and every reminder is excluded from the
            // analytics delivery rate. Same omission as #61, still present on
            // this path (#126).
            message_sid: sendResult.messageSid,
            provider: 'telnyx',
            created_at: new Date().toISOString(),
          });

          if (msgInsertError) {
            console.error(`❌ Sent appointment reminder for event ${event.id} but failed to record it:`, msgInsertError);
          }
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
    await alertAdminsThrottled({
      key: 'cron_run_failed:send-appointment-reminders',
      title: 'Appointment reminder cron is failing',
      body: `The reminder cron threw and processed nothing: ${error.message}. A reminder for an appointment that has already passed cannot be sent late.`,
      data: { route: 'cron/send-appointment-reminders', error: error.message },
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Vercel Cron invokes the scheduled path with an HTTP **GET** — confirmed
// against the docs. This route previously exported the real handler as POST
// and a metadata-only stub as GET, so every scheduled run hit the stub, got
// 200 back, and did nothing. Both methods now run the same handler (#97).
export const GET = handleCron;
export const POST = handleCron;

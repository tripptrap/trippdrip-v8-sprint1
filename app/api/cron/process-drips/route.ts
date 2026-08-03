import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { alertAdminsThrottled } from '@/lib/alerting';
import { requireCronAuth } from '@/lib/cronAuth';
import { resolveFromNumber } from '@/lib/resolveFromNumber';

export const dynamic = "force-dynamic";
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

function getNext9amEST(): Date {
  const now = new Date();
  const hour = getEasternHour(now);

  // Get today's date in Eastern
  const easternDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [month, day, year] = easternDate.split('/');

  // If past 9pm, target tomorrow; otherwise target today
  let targetDate = new Date(`${year}-${month}-${day}T09:00:00`);
  // Convert Eastern 9am to UTC by creating the date in the Eastern timezone
  const targetStr = hour >= 21
    ? `${year}-${month}-${String(Number(day) + 1).padStart(2, '0')}`
    : `${year}-${month}-${day}`;

  // Use a reliable method: set to 9am Eastern
  const target = new Date(now);
  if (hour >= 21) {
    target.setDate(target.getDate() + 1);
  }
  // Find the UTC hour that corresponds to 9am Eastern
  const testDate = new Date(target.toISOString().split('T')[0] + 'T14:00:00Z');
  const testHour = getEasternHour(testDate);
  // Adjust if DST offset differs (14 UTC = 9am EST or 10am EDT)
  if (testHour !== 9) {
    testDate.setUTCHours(testDate.getUTCHours() - (testHour - 9));
  }
  return testDate;
}

function adjustForQuietHours(date: Date): Date {
  const hour = getEasternHour(date);
  if (hour >= 21 || hour < 9) {
    return getNext9amEST();
  }
  return date;
}

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

/**
 * Process Drip Campaign Enrollments
 * Finds enrollments where next_send_at has passed and sends the next step message.
 */
async function handleCron(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    const denied = requireCronAuth(req);
    if (denied) return denied;

    // Enforce quiet hours — reschedule instead of sending
    if (isInQuietHours()) {
      const next9am = getNext9amEST();
      // Reschedule all pending enrollments to 9am
      await supabaseAdmin
        .from('drip_campaign_enrollments')
        .update({ next_send_at: next9am.toISOString() })
        .eq('status', 'active')
        .lte('next_send_at', new Date().toISOString());

      return NextResponse.json({
        ok: true,
        message: 'Quiet hours — rescheduled to 9am EST',
        processed: 0,
      });
    }

    const now = new Date().toISOString();

    // Fetch enrollments ready to send
    const { data: enrollments, error: fetchError } = await supabaseAdmin
      .from('drip_campaign_enrollments')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_at', now)
      .order('next_send_at', { ascending: true })
      .limit(50); // Process in batches

    if (fetchError) {
      console.error('Error fetching enrollments:', fetchError);
      await alertAdminsThrottled({
        key: 'cron_fetch_failed:process-drips',
        title: 'Drip campaigns are not being sent',
        body: `The drip cron cannot read its due enrollments (${fetchError.message}), so every enrolled lead is stuck on its current step.`,
        data: { route: 'cron/process-drips', error: fetchError.message },
      });
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ ok: true, message: 'No enrollments to process', processed: 0 });
    }

    let processed = 0;
    let sent = 0;
    let completed = 0;
    let errors = 0;
    let deferred = 0;   // quiet hours or no credits — retried on a later run

    for (const enrollment of enrollments) {
      processed++;

      try {
        // Check if the parent campaign is still active
        const { data: campaign } = await supabaseAdmin
          .from('drip_campaigns')
          .select('is_active')
          .eq('id', enrollment.campaign_id)
          .single();

        if (!campaign || !campaign.is_active) {
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({ status: 'cancelled' })
            .eq('id', enrollment.id);
          continue;
        }

        // MED-6: Check stop-on-reply — pause enrollment if lead has replied since enrolled.
        // Handles both lead_id and phone-based lookups (null lead_id was dead code before).
        {
          const enrolledSince = enrollment.enrolled_at || enrollment.created_at || '2000-01-01';
          let threadIds: string[] = [];

          if (enrollment.lead_id) {
            // Preferred: look up threads by lead_id
            const { data: leadThreads } = await supabaseAdmin
              .from('threads')
              .select('id')
              .eq('lead_id', enrollment.lead_id)
              .eq('user_id', enrollment.user_id);
            threadIds = (leadThreads || []).map((t: any) => t.id);
          } else if (enrollment.phone_number) {
            // Fallback: look up threads by phone number when lead_id is null
            const { data: phoneThreads } = await supabaseAdmin
              .from('threads')
              .select('id')
              .eq('phone_number', enrollment.phone_number)
              .eq('user_id', enrollment.user_id);
            threadIds = (phoneThreads || []).map((t: any) => t.id);
          }

          if (threadIds.length > 0) {
            const { count: replyCount } = await supabaseAdmin
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .in('thread_id', threadIds)
              .eq('direction', 'inbound')
              .gte('created_at', enrolledSince);

            if (replyCount && replyCount > 0) {
              console.log(`⏸️ Drip: Lead replied — pausing enrollment ${enrollment.id}`);
              await supabaseAdmin
                .from('drip_campaign_enrollments')
                .update({ status: 'paused_reply', paused_at: new Date().toISOString() })
                .eq('id', enrollment.id);
              continue;
            }
          }
        }

        // Get campaign steps
        const { data: steps } = await supabaseAdmin
          .from('drip_campaign_steps')
          .select('*')
          .eq('campaign_id', enrollment.campaign_id)
          .order('step_number', { ascending: true });

        if (!steps || steps.length === 0) {
          // No steps — mark as completed
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({ status: 'completed', completed_at: now })
            .eq('id', enrollment.id);
          completed++;
          continue;
        }

        // current_step is 0-indexed: 0 means "hasn't sent step 1 yet"
        const nextStepIndex = enrollment.current_step;

        if (nextStepIndex >= steps.length) {
          // All steps sent — mark as completed
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({ status: 'completed', completed_at: now })
            .eq('id', enrollment.id);
          completed++;
          continue;
        }

        const step = steps[nextStepIndex];

        // Get lead info
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('id, phone, first_name, last_name, user_id, state, zip_code')
          .eq('id', enrollment.lead_id)
          .single();

        if (!lead || !lead.phone) {
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({ status: 'cancelled' })
            .eq('id', enrollment.id);
          errors++;
          continue;
        }

        // Check DNC list
        const { data: dncCheck } = await supabaseAdmin.rpc('check_dnc', {
          p_user_id: enrollment.user_id,
          p_phone_number: lead.phone,
        });

        if (dncCheck) {
          const dncResult = typeof dncCheck === 'string' ? JSON.parse(dncCheck) : dncCheck;
          if (dncResult.on_dnc_list) {
            console.log(`📧 Drip: Skipping ${lead.phone} — on DNC list`);
            await supabaseAdmin
              .from('drip_campaign_enrollments')
              .update({ status: 'cancelled' })
              .eq('id', enrollment.id);
            continue;
          }
        }

        // Personalize message content
        let message = step.content || '';
        message = message.replace(/\{\{first\}\}/gi, lead.first_name || '');
        message = message.replace(/\{\{last\}\}/gi, lead.last_name || '');
        message = message.replace(/\{\{phone\}\}/gi, lead.phone || '');

        // Apply guardrails
        const { applyGuardrails, DEFAULT_GUARDRAILS } = await import('@/lib/ai/guardrails');
        const guardrailResult = applyGuardrails(message, DEFAULT_GUARDRAILS);
        if (!guardrailResult.passed) {
          console.warn(`Drip message blocked by guardrails for enrollment ${enrollment.id}:`, guardrailResult.violations);
          // Skip this step to avoid infinite retry — advance to next step or complete
          const skippedStep = nextStepIndex + 1;
          if (skippedStep >= steps.length) {
            await supabaseAdmin
              .from('drip_campaign_enrollments')
              .update({ current_step: skippedStep, status: 'completed', completed_at: now })
              .eq('id', enrollment.id);
            completed++;
          } else {
            const nextStepDef = steps[skippedStep];
            const delayMs = ((nextStepDef.delay_days || 0) * 24 * 60 * 60 * 1000) +
                            ((nextStepDef.delay_hours || 0) * 60 * 60 * 1000);
            let nextDate = new Date(Date.now() + delayMs);
            nextDate = adjustForQuietHours(nextDate);
            await supabaseAdmin
              .from('drip_campaign_enrollments')
              .update({ current_step: skippedStep, next_send_at: nextDate.toISOString() })
              .eq('id', enrollment.id);
          }
          errors++;
          continue;
        }
        message = guardrailResult.message;

        // Shared resolver — geo, lock and rest all apply here now (#122).
        // This took the primary unconditionally, so a Scale agent's extra
        // numbers were never used for drip steps.
        const fromNumber = (await resolveFromNumber(supabaseAdmin, enrollment.user_id, {
          leadZipCode: lead?.zip_code ?? null,
        })) || '';
        if (!fromNumber) {
          console.error(`📧 Drip: No from number for user ${enrollment.user_id}`);
          errors++;
          continue;
        }

        // Find or create thread for this lead
        let threadId: string | null = null;
        const { data: existingThread } = await supabaseAdmin
          .from('threads')
          .select('id')
          .eq('user_id', enrollment.user_id)
          .eq('lead_id', lead.id)
          .single();

        if (existingThread) {
          threadId = existingThread.id;
        }

        // Opt-out + quiet-hours gate (#50). The coarse gate at the top of this
        // handler reschedules everything to 9am Eastern; this one additionally
        // respects the sender's configured window and the lead's own local
        // time. A quiet-hours block is retryable — next_send_at is left alone
        // so the enrollment is simply picked up on a later run.
        const guard = await checkSmsAllowed(supabaseAdmin, enrollment.user_id, lead.phone, {
          enforceQuietHours: true,
          recipientState: lead.state,
          context: { source: 'drip_campaign', enrollment_id: enrollment.id },
        });

        if (!guard.allowed) {
          console.log(`Drip: skipping ${lead.phone} — ${guard.reason} (${guard.detail})`);
          if (!guard.retryable) {
            await supabaseAdmin
              .from('drip_campaign_enrollments')
              .update({ status: 'stopped_opted_out', next_send_at: null })
              .eq('id', enrollment.id);
          }
          deferred++;
          continue;
        }

        // Charge credits before sending (#45). Drip messages are SMS and cost
        // 1pt like any other, but this path never charged — a user could run
        // unlimited drip sequences for free, and the out-of-credits blocker
        // never applied to them.
        const { data: creditRow } = await supabaseAdmin
          .from('users')
          .select('credits')
          .eq('id', enrollment.user_id)
          .single();

        if (!creditRow || (creditRow.credits ?? 0) < 1) {
          console.log(`Drip: user ${enrollment.user_id} is out of credits — pausing enrollment ${enrollment.id}`);
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({ status: 'paused_no_credits' })
            .eq('id', enrollment.id);
          deferred++;
          continue;
        }

        const { error: deductError } = await supabaseAdmin.rpc('deduct_credits', {
          user_id: enrollment.user_id,
          amount: 1,
        });

        if (deductError) {
          console.error(`Drip: failed to deduct credits for user ${enrollment.user_id} — not sending:`, deductError);
          errors++;
          continue;
        }

        // Send via Telnyx
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
        const sendResponse = await fetch(`${baseUrl}/api/telnyx/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.CRON_SECRET || '',
          },
          body: JSON.stringify({
            to: lead.phone,
            from: fromNumber,
            message,
            userId: enrollment.user_id,
            threadId: threadId || undefined,
            leadId: lead.id,
            isAutomated: true,
            automationSource: 'drip_campaign',
          }),
        });

        const sendData = await sendResponse.json();

        if (!sendResponse.ok || !sendData.success) {
          console.error(`📧 Drip: Failed to send step ${nextStepIndex + 1} to ${lead.phone}:`, sendData.error);
          errors++;
          continue;
        }

        sent++;

        // Calculate next step timing
        const newStep = nextStepIndex + 1;
        let nextSendAt: string | null = null;

        if (newStep < steps.length) {
          const nextStepDef = steps[newStep];
          const delayMs = ((nextStepDef.delay_days || 0) * 24 * 60 * 60 * 1000) +
                          ((nextStepDef.delay_hours || 0) * 60 * 60 * 1000);
          let nextDate = new Date(Date.now() + delayMs);
          nextDate = adjustForQuietHours(nextDate);
          nextSendAt = nextDate.toISOString();
        }

        // Update enrollment
        if (newStep >= steps.length) {
          // All steps done
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({
              current_step: newStep,
              status: 'completed',
              completed_at: new Date().toISOString(),
              next_send_at: null,
            })
            .eq('id', enrollment.id);

          // Log flow completion
          try {
            await supabaseAdmin.from('flow_completion_log').insert({
              user_id: enrollment.user_id,
              lead_id: enrollment.lead_id,
              campaign_id: enrollment.campaign_id,
              steps_completed: newStep,
              total_steps: steps.length,
              completed_at: new Date().toISOString(),
            });
          } catch (logErr) {
            console.warn('Could not log flow completion:', logErr);
          }

          completed++;
        } else {
          await supabaseAdmin
            .from('drip_campaign_enrollments')
            .update({
              current_step: newStep,
              next_send_at: nextSendAt,
            })
            .eq('id', enrollment.id);
        }

        // Small delay between sends
        await new Promise(r => setTimeout(r, 100));

      } catch (err) {
        console.error(`📧 Drip: Error processing enrollment ${enrollment.id}:`, err);
        errors++;
      }
    }

    console.log(`📧 Drip cron: processed=${processed}, sent=${sent}, completed=${completed}, errors=${errors}`);

    return NextResponse.json({
      ok: true,
      processed,
      sent,
      completed,
      errors,
      deferred,
    });

  } catch (error: any) {
    console.error('Error in drip campaign cron:', error);
    await alertAdminsThrottled({
      key: 'cron_run_failed:process-drips',
      title: 'Drip campaign cron is failing',
      body: `The drip cron threw and processed nothing: ${error.message}. Enrolled leads stop advancing until this is fixed.`,
      data: { route: 'cron/process-drips', error: error.message },
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

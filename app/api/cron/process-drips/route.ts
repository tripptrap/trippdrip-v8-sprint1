import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    // Authenticate cron requests
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

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
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ ok: true, message: 'No enrollments to process', processed: 0 });
    }

    let processed = 0;
    let sent = 0;
    let completed = 0;
    let errors = 0;

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

        // Check stop-on-reply: skip if lead has replied since enrollment
        const { data: replyCheck } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('direction', 'inbound')
          .gte('created_at', enrollment.created_at || enrollment.enrolled_at || '2000-01-01')
          .limit(1);

        // Find if the lead has a thread with inbound messages
        if (enrollment.lead_id) {
          const { data: leadThreads } = await supabaseAdmin
            .from('threads')
            .select('id')
            .eq('lead_id', enrollment.lead_id)
            .eq('user_id', enrollment.user_id);

          if (leadThreads && leadThreads.length > 0) {
            const threadIds = leadThreads.map(t => t.id);
            const { count: replyCount } = await supabaseAdmin
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .in('thread_id', threadIds)
              .eq('direction', 'inbound')
              .gte('created_at', enrollment.enrolled_at || enrollment.created_at || '2000-01-01');

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
          .select('id, phone, first_name, last_name, user_id')
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

        // Get user's Telnyx number for sending
        const { data: userSettings } = await supabaseAdmin
          .from('user_settings')
          .select('telnyx_phone_number')
          .eq('user_id', enrollment.user_id)
          .single();

        const fromNumber = userSettings?.telnyx_phone_number || '';
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

        // Send via Telnyx
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
        const sendResponse = await fetch(`${baseUrl}/api/telnyx/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    });

  } catch (error: any) {
    console.error('Error in drip campaign cron:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET for health check / manual trigger
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/cron/process-drips',
    description: 'Processes drip campaign enrollments and sends scheduled messages',
    method: 'POST to trigger processing',
  });
}

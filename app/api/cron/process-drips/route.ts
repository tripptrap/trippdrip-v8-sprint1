import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Quiet hours: 9pm-9am EST
function isInQuietHours(): boolean {
  const now = new Date();
  const estOffset = -5 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();
  return estHour >= 21 || estHour < 9;
}

function getNext9amEST(): Date {
  const now = new Date();
  const estOffset = -5 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();

  const nextDay = new Date(now);
  if (estHour >= 21) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  nextDay.setUTCHours(14, 0, 0, 0); // 9am EST = 14:00 UTC
  return nextDay;
}

function adjustForQuietHours(date: Date): Date {
  const estOffset = -5 * 60;
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();

  if (estHour >= 21 || estHour < 9) {
    const nextDay = new Date(date);
    if (estHour >= 21) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    nextDay.setUTCHours(14, 0, 0, 0);
    return nextDay;
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

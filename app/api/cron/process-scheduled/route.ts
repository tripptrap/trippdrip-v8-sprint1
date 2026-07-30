import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { sendTelnyxSMS } from "@/lib/telnyx";
import { attachToThread } from "@/lib/threadForSend";
import { checkSmsAllowed } from "@/lib/smsGuard";
import { alertAdminsThrottled } from '@/lib/alerting';
import { requireCronAuth } from '@/lib/cronAuth';

// MED-7: Use service role client — user-scoped createClient() has no session in cron context
// and RLS filters all rows to empty. Service role bypasses RLS as intended for cron jobs.
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Max execution time in seconds


/**
 * CRON JOB ENDPOINT - Process Scheduled Messages & Campaigns
 *
 * This endpoint should be called every 1-5 minutes by:
 * - Vercel Cron Jobs (vercel.json)
 * - External cron service (cron-job.org, EasyCron, etc.)
 * - Supabase Edge Function with pg_cron
 *
 * Security: CRON_SECRET is REQUIRED for all requests
 */

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!supabaseAdmin) {
    console.error('❌ supabaseAdmin not configured — missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = supabaseAdmin;

  try {
    // Process individual scheduled messages
    const messagesProcessed = await processScheduledMessages(supabase);

    // Process scheduled campaigns
    const campaignsProcessed = await processScheduledCampaigns(supabase);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      messagesProcessed,
      campaignsProcessed,
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    // The whole run died, so nothing scheduled went out this cycle (#80).
    await alertAdminsThrottled({
      key: 'cron_run_failed:process-scheduled',
      title: 'Scheduled-message cron is failing',
      body: `The cron that sends scheduled messages and campaign batches threw and processed nothing: ${error.message}. Scheduled sends are stalled until this is fixed.`,
      data: { route: 'cron/process-scheduled', error: error.message },
    });
    return NextResponse.json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

/**
 * Process individual scheduled messages that are ready to send
 */
async function processScheduledMessages(supabase: any) {
  // Get messages ready to send using the helper function
  const { data: readyMessages, error } = await supabase
    .rpc('get_messages_ready_to_send');

  if (error) {
    // The route still returns ok:true when this happens, so an uptime check
    // sees green while zero messages go out. Nothing else would surface it (#80).
    console.error('Error fetching ready messages:', error);
    await alertAdminsThrottled({
      key: 'cron_fetch_failed:process-scheduled:messages',
      title: 'Scheduled messages are not being sent',
      body: `get_messages_ready_to_send() is failing (${error.message}), so no scheduled message has been sent since this started. The cron still reports success, so nothing else will surface it.`,
      data: { route: 'cron/process-scheduled', rpc: 'get_messages_ready_to_send', error: error.message },
    });
    return { processed: 0, failed: 0, error: error.message };
  }

  if (!readyMessages || readyMessages.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  // Process each message
  for (const message of readyMessages) {
    try {
      // Quiet hours are checked further down, once the lead is loaded — they
      // now gate on the RECIPIENT's local time (#60), which needs lead.state.
      const { data: userSettings } = await supabase
        .from('users')
        .select('credits')
        .eq('id', message.user_id)
        .single();

      if (!userSettings || userSettings.credits < message.credits_cost) {
        // Not enough credits - mark as failed
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: 'Insufficient credits',
            updated_at: new Date().toISOString(),
          })
          .eq('id', message.id);

        failed++;
        continue;
      }

      // Get lead details
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', message.lead_id)
        .single();

      if (!lead) {
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: 'Lead not found',
            updated_at: new Date().toISOString(),
          })
          .eq('id', message.id);

        failed++;
        continue;
      }

      // Single gate for opt-out and quiet hours (#60). This path used to run its
      // own inline DNC check plus a sender-local quiet-hours check — the only
      // send path still gating on the SENDER's timezone after #50. A lead in
      // California with a message scheduled by an Eastern user was evaluated
      // against Eastern time, so an 08:00 release arrived at 05:00 their time.
      //
      // Placed after the lead load (it needs lead.state) and BEFORE the
      // pending->sending claim below, so a quiet-hours deferral leaves the row
      // pending for a later run rather than stranding it in 'sending' (#44).
      if (lead.phone) {
        const guard = await checkSmsAllowed(supabase, message.user_id, lead.phone, {
          enforceQuietHours: true,
          recipientState: lead.state,
          context: { source: 'scheduled', scheduled_message_id: message.id },
        });

        if (!guard.allowed) {
          if (guard.retryable) {
            // Quiet hours — leave pending, the next run will pick it up.
            console.log(`Scheduled msg ${message.id} deferred — ${guard.detail}`);
            continue;
          }
          console.log(`🚫 Scheduled msg ${message.id} blocked — ${guard.reason} (${guard.detail})`);
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
              error_message: `Blocked: ${guard.reason} — ${guard.detail}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);
          failed++;
          continue;
        }
      }

      // Get user's primary Telnyx number
      const { data: primaryNumber } = await supabase
        .from('user_telnyx_numbers')
        .select('phone_number')
        .eq('user_id', message.user_id)
        .eq('is_primary', true)
        .eq('status', 'active')
        .single();

      // Send the message based on channel
      if (message.channel === 'sms') {
        // #44: claim the row BEFORE sending. get_messages_ready_to_send()
        // selects `status = 'pending'`, so if the post-send update to 'sent'
        // ever failed, the row stayed pending with scheduled_for in the past
        // and the next run (5 minutes later) sent the same SMS again — forever,
        // with no attempt cap. Moving the state change ahead of the send turns
        // that unbounded resend into a single missed message, which is the far
        // cheaper failure. A row stuck in 'sending' is visible and recoverable;
        // a lead texted every 5 minutes is not.
        //
        // .select() is what makes the guard work. supabase-js returns
        // { error: null, status: 204 } for an UPDATE that matched *zero* rows,
        // so a worker that lost the race looks exactly like one that won it and
        // would send anyway — the double send this claim exists to prevent.
        // Asking for the row back is the only way to tell. process-ai-drips and
        // send-appointment-reminders already do this; this one did not.
        //
        // It matters here most: .github/workflows/scheduled-messages-cron.yml
        // hits this route every 5 minutes *as well as* Vercel Cron, both on the
        // same */5 boundary, so concurrent runs are normal rather than rare.
        const { data: claimed, error: claimError } = await supabase
          .from('scheduled_messages')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', message.id)
          .eq('status', 'pending')   // lost update = another worker has it
          .select('id');

        if (claimError) {
          console.error(`Could not claim scheduled message ${message.id} — skipping to avoid a double send:`, claimError);
          failed++;
          continue;
        }

        if (!claimed || claimed.length === 0) {
          console.log(`Scheduled message ${message.id} was already claimed by another run — skipping.`);
          continue;
        }

        // Send SMS via Telnyx
        const smsResult = await sendSMS(lead.phone, message.body, primaryNumber?.phone_number);

        if (smsResult.success) {
          // CRIT-1: Atomic credit deduction via RPC — prevents race condition from read-then-write
          const { error: deductError } = await supabase.rpc('deduct_credits', {
            user_id: message.user_id,
            amount: message.credits_cost,
          });

          if (deductError) {
            // The SMS has already gone out, so this can't be undone — but it
            // must be visible, otherwise the message was effectively free.
            console.error(`❌ Credits NOT deducted for user ${message.user_id} after sending message ${message.id}:`, deductError);
          }

          // Create message record with automation tracking.
          // Column names verified against the live schema (#53): messages uses
          // points_cost, and has no sender/segments — `direction` already
          // distinguishes agent from lead. Writing the old names silently
          // failed, so none of these sends were ever recorded.
          // #59: attach to the conversation thread. This cron was the only
          // send path that never did, so scheduled messages reached the lead
          // but never showed up in the conversation view and left the thread's
          // counters and preview stale.
          const threadId = await attachToThread(supabase, {
            userId: message.user_id,
            phone: lead.phone,
            leadId: message.lead_id,
            campaignId: message.campaign_id ?? null,
            lastMessage: message.body,
          });

          const { error: msgInsertError } = await supabase
            .from('messages')
            .insert({
              user_id: message.user_id,
              lead_id: message.lead_id,
              thread_id: threadId,
              direction: 'outbound',
              content: message.body,
              body: message.body,
              channel: 'sms',
              status: 'sent',
              points_cost: message.credits_cost,
              is_automated: true,
              automation_source: 'scheduled',
            });

          if (msgInsertError) {
            console.error(`❌ Sent message ${message.id} but failed to record it:`, msgInsertError);
          }

          // Mark scheduled message as sent
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);

          // Update lead last_interaction_at
          await supabase
            .from('leads')
            .update({ last_interaction_at: new Date().toISOString() })
            .eq('id', message.lead_id);

          processed++;
        } else {
          // Mark as failed with error
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
              error_message: smsResult.error || 'Failed to send SMS',
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);

          failed++;
        }
      } else if (message.channel === 'email') {
        // Send email via your provider (SendGrid, Resend, etc.)
        const emailResult = await sendEmail(lead.email, message.subject, message.body);

        if (emailResult.success) {
          // Similar process as SMS
          await supabase
            .from('users')
            .update({ credits: userSettings.credits - message.credits_cost })
            .eq('id', message.user_id);

          await supabase
            .from('messages')
            .insert({
              user_id: message.user_id,
              lead_id: message.lead_id,
              direction: 'outbound',
              sender: 'agent',
              body: message.body,
              channel: 'email',
              status: 'sent',
              credits_cost: message.credits_cost,
              is_automated: true,
              automation_source: 'scheduled',
            });

          await supabase
            .from('scheduled_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);

          await supabase
            .from('leads')
            .update({ last_interaction_at: new Date().toISOString() })
            .eq('id', message.lead_id);

          processed++;
        } else {
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
              error_message: emailResult.error || 'Failed to send email',
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);

          failed++;
        }
      }
    } catch (err: any) {
      console.error('Error processing message:', message.id, err);
      failed++;
    }
  }

  return { processed, failed };
}

/**
 * Process scheduled campaigns that are ready for next batch
 */
async function processScheduledCampaigns(supabase: any) {
  // Get campaigns ready for batch
  const { data: readyCampaigns, error } = await supabase
    .rpc('get_campaigns_ready_for_batch');

  if (error) {
    console.error('Error fetching ready campaigns:', error);
    await alertAdminsThrottled({
      key: 'cron_fetch_failed:process-scheduled:campaigns',
      title: 'Campaign batches are not being sent',
      body: `get_campaigns_ready_for_batch() is failing (${error.message}), so no campaign batch has gone out since this started. The cron still reports success.`,
      data: { route: 'cron/process-scheduled', rpc: 'get_campaigns_ready_for_batch', error: error.message },
    });
    return { processed: 0, batches: 0, error: error.message };
  }

  if (!readyCampaigns || readyCampaigns.length === 0) {
    return { processed: 0, batches: 0 };
  }

  let totalProcessed = 0;
  let totalBatches = 0;

  // Process each campaign
  for (const campaign of readyCampaigns) {
    try {
      // Check if user is within quiet hours
      const { data: withinQuietHours } = await supabase
        .rpc('is_within_quiet_hours', {
          user_id_param: campaign.user_id,
          check_time: new Date().toISOString()
        });

      if (!withinQuietHours) {
        // Skip this campaign - outside quiet hours
        console.log(`Skipping campaign ${campaign.id} - outside quiet hours for user ${campaign.user_id}`);
        continue;
      }
      // Calculate how many leads to send to in this batch
      const leadsPerBatch = Math.ceil((campaign.total_leads * campaign.percentage_per_batch) / 100);

      // Get the leads that haven't been sent to yet
      const startIndex = campaign.leads_sent;
      const endIndex = Math.min(startIndex + leadsPerBatch, campaign.total_leads);
      const leadIdsToSend = campaign.lead_ids.slice(startIndex, endIndex);

      if (leadIdsToSend.length === 0) {
        // Campaign is complete
        await supabase
          .from('scheduled_campaigns')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaign.id);

        continue;
      }

      // Get user's primary Telnyx number once for all leads in campaign
      const { data: campaignPrimaryNumber } = await supabase
        .from('user_telnyx_numbers')
        .select('phone_number')
        .eq('user_id', campaign.user_id)
        .eq('is_primary', true)
        .eq('status', 'active')
        .single();

      // Send to each lead in this batch
      let batchProcessed = 0;
      for (const leadId of leadIdsToSend) {
        try {
          // Get lead details
          const { data: lead } = await supabase
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .single();

          if (!lead) continue;

          // Get user's credits
          const { data: user } = await supabase
            .from('users')
            .select('credits')
            .eq('id', campaign.user_id)
            .single();

          // Calculate credits needed for this message
          const segments = Math.ceil(campaign.message.length / 160);
          const creditsNeeded = segments * 2; // 2 credits per segment

          if (!user || user.credits < creditsNeeded) {
            // Not enough credits - pause campaign
            await supabase
              .from('scheduled_campaigns')
              .update({
                status: 'paused',
                updated_at: new Date().toISOString(),
              })
              .eq('id', campaign.id);

            break;
          }

          // Send SMS
          const smsResult = await sendSMS(lead.phone, campaign.message, campaignPrimaryNumber?.phone_number);

          if (smsResult.success) {
            // CRIT-1: Atomic credit deduction via RPC
            const { error: batchDeductError } = await supabase.rpc('deduct_credits', { user_id: campaign.user_id, amount: creditsNeeded });
            if (batchDeductError) {
              // Already sent — can't be rolled back, so make it visible (#90).
              console.error(`❌ Campaign batch message sent for campaign ${campaign.id} but ${creditsNeeded} credits NOT deducted for user ${campaign.user_id}:`, batchDeductError);
            }

            // Create message record with automation tracking
            await supabase
              .from('messages')
              .insert({
                user_id: campaign.user_id,
                lead_id: leadId,
                direction: 'outbound',
                sender: 'agent',
                body: campaign.message,
                channel: 'sms',
                status: 'sent',
                credits_cost: creditsNeeded,
                segments,
                is_automated: true,
                automation_source: 'bulk_campaign',
                campaign_id: campaign.id,
              });

            // Update lead last_interaction_at
            await supabase
              .from('leads')
              .update({ last_interaction_at: new Date().toISOString() })
              .eq('id', leadId);

            batchProcessed++;
          }
        } catch (err) {
          console.error('Error sending to lead:', leadId, err);
        }
      }

      // Update campaign progress
      const newLeadsSent = campaign.leads_sent + batchProcessed;
      const isComplete = newLeadsSent >= campaign.total_leads;

      // Calculate next batch date
      const nextBatchDate = new Date();
      nextBatchDate.setHours(nextBatchDate.getHours() + campaign.interval_hours);

      await supabase
        .from('scheduled_campaigns')
        .update({
          leads_sent: newLeadsSent,
          next_batch_date: isComplete ? null : nextBatchDate.toISOString(),
          status: isComplete ? 'completed' : 'running',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);

      totalProcessed += batchProcessed;
      totalBatches++;
    } catch (err: any) {
      console.error('Error processing campaign:', campaign.id, err);
    }
  }

  return { processed: totalProcessed, batches: totalBatches };
}

/**
 * Send SMS via Telnyx
 */
async function sendSMS(to: string, body: string, from?: string): Promise<{ success: boolean; error?: string; messageSid?: string }> {
  const result = await sendTelnyxSMS({
    to,
    message: body,
    from,
  });

  if (result.success) {
    return { success: true, messageSid: result.messageSid };
  } else {
    return { success: false, error: result.error || 'Failed to send SMS' };
  }
}

/**
 * Send email via your provider
 * TODO: Integrate with your actual email provider (SendGrid, Resend, etc.)
 */
async function sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; error?: string }> {
  // TODO: Replace with actual email provider integration
  console.log('Sending email to:', to, 'Subject:', subject);

  // Example with Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'noreply@yourdomain.com',
  //   to,
  //   subject,
  //   html: body,
  // });

  // MED-11: Email provider not yet integrated — return failure so credits are NOT deducted
  // and the message is marked as failed instead of silently "sent".
  // TODO: Replace with real email provider (SendGrid, Resend, Postmark, etc.)
  console.warn(`⚠️ Email send skipped — no provider configured (to: ${to})`);
  return { success: false, error: 'Email provider not configured' };
}

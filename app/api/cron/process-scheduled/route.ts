import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { sendTelnyxSMS } from "@/lib/telnyx";
import { attachToThread } from "@/lib/threadForSend";
import { checkSmsAllowed, noteDeferred } from "@/lib/smsGuard";
import { withOptOutFooterIfFirst } from "@/lib/optOutFooter";
import { moderateOutbound, type ModerationDecision } from "@/lib/smsModeration";
import { resolveFromNumber } from "@/lib/resolveFromNumber";
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
  const denied = await requireCronAuth(req);
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
  // Read the due rows directly rather than through get_messages_ready_to_send().
  //
  // ── Why this does not call the RPC any more (#61) ──────────────────────────
  //
  // That function returns the due row to psql, to a raw PostgREST call with this
  // same service-role key, and to this same client library run locally — but it
  // returned `data: [], error: null` to this route on every single production
  // run. Measured in one request, at a moment when exactly one row was 54
  // minutes overdue:
  //
  //     whoami_probe()              -> current_user: service_role, 2 rows visible
  //     get_messages_ready_to_send()-> count: 0, error: null
  //
  // So it is not authentication (the role is right), not RLS (the same client
  // reads the table fine in the same request), and not timing (the row was long
  // due). The function simply yields nothing to this caller, silently — no error
  // to catch, and `length === 0` returns early without logging, which is why
  // this reported `processed: 0` and looked healthy for months.
  //
  // The predicate is two comparisons. Inlining it removes the dependency on a
  // component that has demonstrably lied to the only caller that matters. Note
  // this compares against the app clock instead of the database's `now()`; both
  // track NTP and the cron runs every 5 minutes, so sub-second skew cannot
  // change which rows are due.
  const nowIso = new Date().toISOString();
  const { data: readyMessages, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    // Batch cap. `maxDuration` is 60s and each iteration does several round
    // trips plus a Telnyx send, so an uncapped backlog would time out mid-loop
    // and strand rows in 'sending'. This never mattered while the fetch above
    // returned zero rows; now that it returns real work, it does. Oldest first,
    // cron every 5 minutes — a backlog drains at ~1,200/hour rather than
    // killing the run.
    .limit(100);

  if (error) {
    // The route still returns ok:true when this happens, so an uptime check
    // sees green while zero messages go out. Nothing else would surface it (#80).
    console.error('Error fetching ready messages:', error);
    await alertAdminsThrottled({
      key: 'cron_fetch_failed:process-scheduled:messages',
      title: 'Scheduled messages are not being sent',
      body: `The scheduled_messages query is failing (${error.message}), so no scheduled message has been sent since this started. The cron still reports success, so nothing else will surface it.`,
      data: { route: 'cron/process-scheduled', query: 'scheduled_messages', error: error.message },
    });
    return { processed: 0, failed: 0, error: error.message };
  }

  if (!readyMessages || readyMessages.length === 0) {
    return { processed: 0, failed: 0 };
  }

  console.log(`📤 ${readyMessages.length} scheduled message(s) due`);

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
            // Quiet hours or a rate cap — leave pending, a later run picks it up,
            // and record WHY so a waiting message is distinguishable from a dead
            // cron (#128).
            console.log(`Scheduled msg ${message.id} deferred — ${guard.detail}`);
            await noteDeferred(supabase, message.id, guard.detail || `Waiting: ${guard.reason}`);
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

      // Routed through the shared resolver so this path honours geo-routing,
      // locks and rests like every other one (#122). It previously took the
      // primary unconditionally, so extra numbers did nothing for scheduled
      // sends — most of the automated volume.
      //
      // A failure here used to become `primaryNumber = null`, which was passed
      // on as `primaryNumber?.phone_number` — undefined — and sendTelnyxSMS then
      // sent via the messaging profile from a number nobody chose, marked the row
      // `sent` and deducted credits (#125). This is the highest-volume automated
      // path, so that was the common case, not an edge one.
      const resolved = await resolveFromNumber(supabase, message.user_id, {
        leadZipCode: lead.zip_code,
        toPhone: lead.phone,
      });

      if (!resolved.ok) {
        if (resolved.retryable) {
          // A lookup failure is transient — leave the row pending so the next
          // run picks it up, exactly as a quiet-hours deferral does.
          console.log(`Scheduled msg ${message.id} deferred — ${resolved.detail}`);
          await noteDeferred(supabase, message.id, resolved.detail);
          continue;
        }
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: resolved.detail,
            updated_at: new Date().toISOString(),
          })
          .eq('id', message.id);
        failed++;
        continue;
      }

      const primaryNumber = { phone_number: resolved.number };

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
        // First-contact opt-out footer (#131). This path had none, so a
        // scheduled message could be an agent's first contact with a lead and
        // carry no opt-out instruction — while the public compliance evidence
        // stated that every first message does.
        const scheduledBody = await withOptOutFooterIfFirst(
          supabase,
          message.user_id,
          lead.phone,
          message.body
        );
        const smsResult = await sendSMS(supabase, message.user_id, lead.phone, scheduledBody, primaryNumber?.phone_number);

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
              // Both phone columns, previously omitted (#126). Without
              // from_phone this send is invisible to get_number_health_stats,
              // which computes opt_out_rate as opt_outs/sent over rows that HAVE
              // a from_phone — so scheduled volume was missing from the
              // denominator and inflated every number's opt-out rate, on the
              // page that tells the agent to rest a number at 5%.
              from_phone: primaryNumber?.phone_number ?? null,
              to_phone: lead.phone,
              content: message.body,
              body: message.body,
              channel: 'sms',
              status: 'sent',
              points_cost: message.credits_cost,
              is_automated: true,
              automation_source: 'scheduled',
              // Without these the message can never leave 'sent'. The delivery
              // webhook matches on `.eq('message_sid', ...)`, so a null sid means
              // 'delivered' and 'failed' never land and the analytics delivery
              // rate silently excludes every automated message (#61).
              message_sid: smsResult.messageSid,
              provider: 'telnyx',
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

          // `sender` and `credits_cost` are not columns on public.messages — the
          // live table has points_cost, and `content` is NOT NULL (#126).
          // Postgres rejects the whole INSERT for an unknown column, and this
          // call never destructured `error`, so every scheduled email recorded
          // nothing at all while the row was marked sent.
          const { error: emailMsgInsertError } = await supabase
            .from('messages')
            .insert({
              user_id: message.user_id,
              lead_id: message.lead_id,
              direction: 'outbound',
              content: message.body,
              body: message.body,
              channel: 'email',
              status: 'sent',
              points_cost: message.credits_cost,
              is_automated: true,
              automation_source: 'scheduled',
            });

          if (emailMsgInsertError) {
            console.error(
              `❌ Scheduled email ${message.id} sent but failed to record it:`,
              emailMsgInsertError
            );
          }

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
  // Read due campaigns directly, for the same reason the message query above
  // does (#61): get_campaigns_ready_for_batch() has the identical shape —
  // SECURITY DEFINER returning SETOF scheduled_campaigns — and the sibling
  // function with that shape returned zero rows to this route while returning
  // them to every other caller. Campaign batches have never been observed
  // going out, which is consistent with this having the same fault.
  const nowIso = new Date().toISOString();
  const { data: readyCampaigns, error } = await supabase
    .from('scheduled_campaigns')
    .select('*')
    .in('status', ['scheduled', 'running'])
    .lte('next_batch_date', nowIso)
    .order('next_batch_date', { ascending: true });

  if (error) {
    console.error('Error fetching ready campaigns:', error);
    await alertAdminsThrottled({
      key: 'cron_fetch_failed:process-scheduled:campaigns',
      title: 'Campaign batches are not being sent',
      body: `The scheduled_campaigns query is failing (${error.message}), so no campaign batch has gone out since this started. The cron still reports success.`,
      data: { route: 'cron/process-scheduled', query: 'scheduled_campaigns', error: error.message },
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
          const smsResult = await sendSMS(supabase, campaign.user_id, lead.phone, campaign.message, campaignPrimaryNumber?.phone_number);

          if (smsResult.success) {
            // CRIT-1: Atomic credit deduction via RPC
            const { error: batchDeductError } = await supabase.rpc('deduct_credits', { user_id: campaign.user_id, amount: creditsNeeded });
            if (batchDeductError) {
              // Already sent — can't be rolled back, so make it visible (#90).
              console.error(`❌ Campaign batch message sent for campaign ${campaign.id} but ${creditsNeeded} credits NOT deducted for user ${campaign.user_id}:`, batchDeductError);
            }

            // Three of the columns this used to write — `sender`,
            // `credits_cost` and `segments` — do not exist on public.messages.
            // Postgres rejects the entire INSERT when any column is unknown, and
            // the result was never destructured, so **every campaign-batch send
            // recorded nothing at all** (#126).
            //
            // Those sends were therefore invisible to `get_send_counts`, which is
            // what enforces the per-account rate limit — a campaign batch could
            // run at any size without moving the counter that is supposed to cap
            // it — and invisible to number health and analytics.
            //
            // `segments` has nowhere to go and is dropped rather than invented;
            // it is recomputed from the body wherever it is actually needed.
            const { error: batchMsgInsertError } = await supabase
              .from('messages')
              .insert({
                user_id: campaign.user_id,
                lead_id: leadId,
                direction: 'outbound',
                from_phone: campaignPrimaryNumber?.phone_number ?? null,
                to_phone: lead.phone,
                content: campaign.message,
                body: campaign.message,
                channel: 'sms',
                status: 'sent',
                points_cost: creditsNeeded,
                is_automated: true,
                automation_source: 'bulk_campaign',
                campaign_id: campaign.id,
                // Same as the scheduled path above — the delivery webhook keys
                // on message_sid, so omitting it strands the row at 'sent' (#61).
                message_sid: smsResult.messageSid,
                provider: 'telnyx',
              });

            if (batchMsgInsertError) {
              console.error(
                `❌ Campaign ${campaign.id} sent to ${lead.phone} but failed to record it:`,
                batchMsgInsertError
              );
            }

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
 * Send SMS via Telnyx, after moderating the content (#123).
 *
 * Moderation lives here rather than at the two call sites because both of them
 * — the scheduled-message loop and the campaign-batch loop — need it, and a
 * helper that both already funnel through cannot be forgotten by one of them.
 *
 * A block is returned as an ordinary failure with a readable error. That is
 * deliberate: both callers already mark the row `failed` and store `error` in
 * `error_message`, so the user sees *why* their scheduled message did not go
 * out instead of finding it silently missing. It is also correctly permanent —
 * retrying identical text would fail identically, so `failed` beats leaving it
 * pending for a cron that will keep rejecting it.
 */
async function sendSMS(
  supabase: SupabaseClient,
  userId: string,
  to: string,
  body: string,
  from: string
): Promise<{ success: boolean; error?: string; messageSid?: string; moderation: ModerationDecision }> {
  const moderation = await moderateOutbound(supabase, userId, body);
  if (!moderation.allowed) {
    console.log(`🚫 Scheduled send blocked by moderation for user ${userId} — score ${moderation.spamScore}`);
    return { success: false, error: moderation.detail || 'Blocked by content moderation', moderation };
  }

  const result = await sendTelnyxSMS({
    to,
    message: body,
    from,
    moderation,
  });

  if (result.success) {
    return { success: true, messageSid: result.messageSid, moderation };
  } else {
    return { success: false, error: result.error || 'Failed to send SMS', moderation };
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

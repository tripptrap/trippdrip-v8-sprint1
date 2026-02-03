import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { timingSafeEqual } from 'crypto';
import { sendTelnyxSMS } from "@/lib/telnyx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Max execution time in seconds

/**
 * Timing-safe comparison for secrets to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

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
  // SECURITY: Mandatory cron secret validation
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error('❌ CRON_SECRET not configured - rejecting request');
    return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
  }

  if (!secureCompare(cronSecret, expectedSecret)) {
    console.error('❌ Invalid or missing cron secret - unauthorized request');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

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
    console.error('Error fetching ready messages:', error);
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
      // Check quiet hours for this user
      const { data: userSettings } = await supabase
        .from('users')
        .select('credits, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
        .eq('id', message.user_id)
        .single();

      if (userSettings?.quiet_hours_enabled) {
        const now = new Date();
        const userTz = userSettings.timezone || 'America/New_York';
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTz }));
        const currentHour = userTime.getHours();
        const currentMinute = userTime.getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2,'0')}:${String(currentMinute).padStart(2,'0')}`;
        const start = (userSettings.quiet_hours_start || '08:00').substring(0, 5);
        const end = (userSettings.quiet_hours_end || '20:00').substring(0, 5);

        if (currentTimeStr < start || currentTimeStr >= end) {
          console.log(`Skipping scheduled message ${message.id} - outside quiet hours for user ${message.user_id}`);
          continue;
        }
      }

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
        // Send SMS via Telnyx
        const smsResult = await sendSMS(lead.phone, message.body, primaryNumber?.phone_number);

        if (smsResult.success) {
          // Deduct credits
          await supabase
            .from('users')
            .update({ credits: userSettings.credits - message.credits_cost })
            .eq('id', message.user_id);

          // Create message record with automation tracking
          await supabase
            .from('messages')
            .insert({
              user_id: message.user_id,
              lead_id: message.lead_id,
              direction: 'out',
              sender: 'agent',
              body: message.body,
              channel: 'sms',
              status: 'sent',
              credits_cost: message.credits_cost,
              segments: message.segments,
              is_automated: true,
              automation_source: 'scheduled',
            });

          // Mark scheduled message as sent
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', message.id);

          // Update lead last_contacted
          await supabase
            .from('leads')
            .update({ last_contacted: new Date().toISOString() })
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
              direction: 'out',
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
            .update({ last_contacted: new Date().toISOString() })
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
            // Deduct credits
            await supabase
              .from('users')
              .update({ credits: user.credits - creditsNeeded })
              .eq('id', campaign.user_id);

            // Create message record with automation tracking
            await supabase
              .from('messages')
              .insert({
                user_id: campaign.user_id,
                lead_id: leadId,
                direction: 'out',
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

            // Update lead last_contacted
            await supabase
              .from('leads')
              .update({ last_contacted: new Date().toISOString() })
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

  return { success: true };
}

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { calculateSMSCredits } from "@/lib/creditCalculator";
import { sendTelnyxSMS } from "@/lib/telnyx";
import { checkSmsAllowed, noteDeferred } from "@/lib/smsGuard";
import { moderateOutbound } from "@/lib/smsModeration";
import { withOptOutFooterIfFirst } from "@/lib/optOutFooter";
import { resolveFromNumber } from '@/lib/resolveFromNumber';

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BulkScheduleRequest {
  leadIds: string[];
  body: string;
  scheduledFor: string;
  channel: 'sms' | 'email';
  subject?: string;
}

interface BulkActionRequest {
  action: 'cancel' | 'send-now';
  messageIds: string[];
}

// Create admin client for operations that need to bypass RLS
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createAdminClient(supabaseUrl, serviceKey);
}

/**
 * POST - Bulk schedule messages to multiple leads
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body: BulkScheduleRequest = await req.json();
    const { leadIds, body: messageBody, scheduledFor, channel, subject } = body;

    if (!leadIds || leadIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No leads selected" }, { status: 400 });
    }

    if (!messageBody || !scheduledFor) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ ok: false, error: "Scheduled time must be in the future" }, { status: 400 });
    }

    // Calculate credits for SMS
    let creditsCost = 0;
    let segments = 0;
    if (channel === 'sms') {
      const creditCalc = calculateSMSCredits(messageBody, 0);
      creditsCost = creditCalc.credits;
      segments = creditCalc.segments;
    }

    // Verify all leads belong to this user
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', user.id)
      .in('id', leadIds);

    if (leadsError || !leads) {
      return NextResponse.json({ ok: false, error: "Failed to verify leads" }, { status: 500 });
    }

    const validLeadIds = leads.map(l => l.id);
    if (validLeadIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid leads found" }, { status: 400 });
    }

    // Create scheduled messages for each lead
    const messagesToInsert = validLeadIds.map(leadId => ({
      user_id: user.id,
      lead_id: leadId,
      channel,
      subject: channel === 'email' ? subject : null,
      body: messageBody,
      status: 'pending',
      scheduled_for: scheduledFor,
      credits_cost: creditsCost,
      segments,
    }));

    const { data: insertedMessages, error: insertError } = await supabase
      .from('scheduled_messages')
      .insert(messagesToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting scheduled messages:", insertError);
      return NextResponse.json({ ok: false, error: "Failed to schedule messages" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `${insertedMessages?.length || 0} messages scheduled successfully`,
      scheduled: insertedMessages?.length || 0,
      totalLeads: leadIds.length,
    });
  } catch (error: any) {
    console.error("Error bulk scheduling messages:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to schedule messages" }, { status: 500 });
  }
}

/**
 * PUT - Bulk actions (cancel or send-now)
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = getAdminClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body: BulkActionRequest = await req.json();
    const { action, messageIds } = body;

    if (!action || !messageIds || messageIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing action or messageIds" }, { status: 400 });
    }

    // Verify all messages belong to this user and are pending
    const { data: messages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*, leads:lead_id(id, phone, email, first_name, last_name, state)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .in('id', messageIds);

    if (fetchError || !messages) {
      return NextResponse.json({ ok: false, error: "Failed to fetch messages" }, { status: 500 });
    }

    if (messages.length === 0) {
      return NextResponse.json({ ok: false, error: "No pending messages found" }, { status: 400 });
    }

    const validMessageIds = messages.map(m => m.id);

    if (action === 'cancel') {
      // Bulk cancel
      const { error: updateError } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', validMessageIds);

      if (updateError) {
        return NextResponse.json({ ok: false, error: "Failed to cancel messages" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: `${validMessageIds.length} messages cancelled`,
        cancelled: validMessageIds.length,
      });

    } else if (action === 'send-now') {
      // Bulk send now
      if (!adminClient) {
        return NextResponse.json({ ok: false, error: "Server not configured for sending" }, { status: 500 });
      }

      // Get user's credits
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('credits')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        return NextResponse.json({ ok: false, error: "Failed to get user data" }, { status: 500 });
      }

      // Get user's primary Telnyx number
      // The from-number is resolved per message inside the loop instead of once
      // here (#122). A bulk send goes to leads in different places, so choosing
      // one number up front defeats geo-routing for every recipient but the
      // first — which is exactly what the Scale tier sells.

      // Calculate total credits needed
      const totalCredits = messages.reduce((sum, m) => sum + (m.credits_cost || 0), 0);
      if (userData.credits < totalCredits) {
        return NextResponse.json({
          ok: false,
          error: `Insufficient credits. Need ${totalCredits}, have ${userData.credits}`
        }, { status: 400 });
      }

      let sent = 0;
      let failed = 0;
      let creditsUsed = 0;

      for (const message of messages) {
        try {
          const lead = message.leads as any;
          if (!lead?.phone) {
            failed++;
            continue;
          }

          // Opt-out gate (#40) — bulk sends previously had no DNC check, so an
          // opted-out lead in the batch still received the message.
          const guard = await checkSmsAllowed(createServiceRoleClient(), user.id, lead.phone, {
            enforceQuietHours: true,
            recipientState: lead.state,
            context: { source: 'bulk_scheduled', scheduled_message_id: message.id },
          });

          if (!guard.allowed) {
            console.log(`Bulk send: skipping ${lead.phone} — ${guard.reason} (${guard.detail})`);
            // Only cancel on a permanent block. Quiet-hours and rate-cap
            // deferrals leave the message pending so the scheduled-send cron
            // picks it up once the window opens or the cap resets (#121).
            if (!guard.retryable) {
              await adminClient
                .from('scheduled_messages')
                .update({
                  status: 'cancelled',
                  error_message: `Blocked: ${guard.reason} — ${guard.detail}`,
                })
                .eq('id', message.id);
            } else {
              // Still pending — record why, so it is not mistaken for a message
              // nothing ever picked up (#128).
              await noteDeferred(adminClient, message.id, guard.detail || `Waiting: ${guard.reason}`);
            }
            failed++;
            continue;
          }

          // Send SMS via Telnyx
          //
          // The result used to be passed straight through as
          // `from: fromNumber || undefined`, and a missing number meant Telnyx
          // picked one from the profile pool while the row was marked sent
          // (#125). Now a permanent failure cancels the row with a readable
          // reason and a temporary one leaves it pending for the next run.
          const resolved = await resolveFromNumber(adminClient, user.id, {
            leadZipCode: lead.zip_code ?? null,
            toPhone: lead.phone,
          });
          if (!resolved.ok) {
            console.log(`Bulk send: no sending number for message ${message.id} — ${resolved.reason}`);
            if (!resolved.retryable) {
              await adminClient
                .from('scheduled_messages')
                .update({ status: 'cancelled', error_message: resolved.detail })
                .eq('id', message.id);
            } else {
              await noteDeferred(adminClient, message.id, resolved.detail);
            }
            failed++;
            continue;
          }
          const fromNumber = resolved.number;
          // Content moderation (#123). Bulk scheduling sent user-authored text
          // with no spam check — the same gap sms/send and the scheduled cron
          // had. A block is permanent (identical text scores identically), so
          // the row is cancelled with a readable reason rather than left pending
          // for a cron that would reject it on every run.
          // First-contact opt-out footer (#131) — see process-scheduled. Moderation
          // still scores the agent's own text, not our appended footer.
          const bulkBody = await withOptOutFooterIfFirst(
            adminClient,
            user.id,
            lead.phone,
            message.body
          );

          const moderation = await moderateOutbound(adminClient, user.id, message.body);
          if (!moderation.allowed) {
            console.log(`Bulk send: blocked ${message.id} by moderation — score ${moderation.spamScore}`);
            await adminClient
              .from('scheduled_messages')
              .update({
                status: 'cancelled',
                error_message: moderation.detail || 'Blocked by content moderation',
              })
              .eq('id', message.id);
            failed++;
            continue;
          }

          const result = await sendTelnyxSMS({
            to: lead.phone,
            message: bulkBody,
            from: fromNumber,
            moderation,
          });

          if (result.success) {
            // Mark as sent
            await adminClient
              .from('scheduled_messages')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', message.id);

            // Create message record. Columns verified against the live schema
            // (#53) — messages uses points_cost and has no sender/segments.
            const { error: msgInsertError } = await adminClient
              .from('messages')
              .insert({
                user_id: user.id,
                lead_id: message.lead_id,
                direction: 'outbound',
                // Previously omitted (#126). from_phone is what attributes a send
                // to a number: without it this row is missing from the `sent`
                // denominator in get_number_health_stats, so bulk volume inflated
                // the opt-out rate of whichever number actually sent it.
                from_phone: fromNumber ?? null,
                to_phone: lead.phone,
                content: message.body,
                body: message.body,
                channel: 'sms',
                status: 'sent',
                points_cost: message.credits_cost,
                is_automated: true,
                automation_source: 'scheduled_bulk',
                // The delivery webhook matches on message_sid, so without it this
                // row can never leave 'sent' and every bulk message is excluded
                // from the analytics delivery rate (#61).
                message_sid: result.messageSid,
                provider: 'telnyx',
              });

            if (msgInsertError) {
              console.error(`❌ Sent bulk message ${message.id} but failed to record it:`, msgInsertError);
            }

            // Update lead last_interaction_at
            await adminClient
              .from('leads')
              .update({ last_interaction_at: new Date().toISOString() })
              .eq('id', message.lead_id);

            sent++;
            creditsUsed += message.credits_cost || 0;
          } else {
            // Mark as failed
            await adminClient
              .from('scheduled_messages')
              .update({
                status: 'failed',
                error_message: result.error || 'Failed to send',
                updated_at: new Date().toISOString()
              })
              .eq('id', message.id);
            failed++;
          }
        } catch (err: any) {
          console.error('Error sending message:', message.id, err);
          failed++;
        }
      }

      // Deduct credits via the atomic RPC (#45). This was a read-then-write
      // against a `credits` value read before the send loop began, so any
      // concurrent spend during the loop was silently overwritten.
      if (creditsUsed > 0) {
        const { error: deductError } = await adminClient.rpc('deduct_credits', {
          user_id: user.id,
          amount: creditsUsed,
          reason: 'Bulk send',
        });
        if (deductError) {
          console.error(`❌ Bulk send-now: ${sent} messages sent but ${creditsUsed} credits NOT deducted for user ${user.id}:`, deductError);
        }
      }

      return NextResponse.json({
        ok: true,
        message: `Sent ${sent} messages, ${failed} failed`,
        sent,
        failed,
        creditsUsed,
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in bulk action:", error);
    return NextResponse.json({ ok: false, error: error.message || "Failed to perform action" }, { status: 500 });
  }
}

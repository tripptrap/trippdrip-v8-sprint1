import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { calculateSMSCredits } from "@/lib/creditCalculator";
import { sendTelnyxSMS } from "@/lib/telnyx";

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
      .select('*, leads:lead_id(id, phone, email, first_name, last_name)')
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

      // Get user's credits and phone number
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('credits, telnyx_phone_number')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        return NextResponse.json({ ok: false, error: "Failed to get user data" }, { status: 500 });
      }

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

          // Send SMS via Telnyx
          const result = await sendTelnyxSMS({
            to: lead.phone,
            message: message.body,
            from: userData.telnyx_phone_number || undefined,
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

            // Create message record
            await adminClient
              .from('messages')
              .insert({
                user_id: user.id,
                lead_id: message.lead_id,
                direction: 'out',
                sender: 'agent',
                body: message.body,
                channel: 'sms',
                status: 'sent',
                credits_cost: message.credits_cost,
                segments: message.segments,
                is_automated: true,
                automation_source: 'scheduled_bulk',
              });

            // Update lead last_contacted
            await adminClient
              .from('leads')
              .update({ last_contacted: new Date().toISOString() })
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

      // Deduct credits
      if (creditsUsed > 0) {
        await adminClient
          .from('users')
          .update({ credits: userData.credits - creditsUsed })
          .eq('id', user.id);
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

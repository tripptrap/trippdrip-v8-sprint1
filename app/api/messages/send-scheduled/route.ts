import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cron job endpoint to send scheduled messages
 * Should be called every 5 minutes via Vercel Cron or external cron service
 *
 * In production, add this to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/messages/send-scheduled",
 *     "schedule": "*\/5 * * * *"
 *   }]
 * }
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // This endpoint processes all users' scheduled messages
    // No user authentication needed for cron job

    const now = new Date().toISOString();

    // Find messages that should be sent now
    const { data: messagesToSend, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(100); // Process up to 100 messages per run

    if (fetchError) {
      console.error('Error fetching scheduled messages:', fetchError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch scheduled messages' },
        { status: 500 }
      );
    }

    if (!messagesToSend || messagesToSend.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No messages ready to send",
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    // Process each message
    for (const msg of messagesToSend) {
      try {
        // Get user's Twilio settings
        const { data: userData } = await supabase
          .from('users')
          .select('twilio_config, credits')
          .eq('id', msg.user_id)
          .single();

        if (!userData || !userData.twilio_config) {
          throw new Error('User Twilio config not found');
        }

        // Check if user has enough credits
        if ((userData.credits || 0) < (msg.credits_cost || 0)) {
          throw new Error('Insufficient credits');
        }

        // Get lead information
        const { data: lead } = await supabase
          .from('leads')
          .select('phone')
          .eq('id', msg.lead_id)
          .single();

        if (!lead || !lead.phone) {
          throw new Error('Lead phone number not found');
        }

        const twilioConfig = userData.twilio_config;

        // Send via Twilio API (SMS only for now)
        if (msg.channel === 'sms') {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
          const params = new URLSearchParams();
          params.append('To', lead.phone);
          params.append('From', twilioConfig.phoneNumbers?.[0] || '');
          params.append('Body', msg.body);

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
          });

          const result = await response.json();

          if (response.ok) {
            // Update message status to sent
            await supabase
              .from('scheduled_messages')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                message_sid: result.sid
              })
              .eq('id', msg.id);

            // Deduct credits from user
            await supabase
              .from('users')
              .update({
                credits: (userData.credits || 0) - (msg.credits_cost || 0)
              })
              .eq('id', msg.user_id);

            // Create or update thread
            const { data: existingThread } = await supabase
              .from('threads')
              .select('*')
              .eq('user_id', msg.user_id)
              .eq('lead_id', msg.lead_id)
              .single();

            if (existingThread) {
              await supabase
                .from('threads')
                .update({
                  messages_from_user: (existingThread.messages_from_user || 0) + 1,
                  last_message_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingThread.id);
            } else {
              const { data: newThread } = await supabase
                .from('threads')
                .insert({
                  user_id: msg.user_id,
                  lead_id: msg.lead_id,
                  messages_from_user: 1,
                  messages_from_lead: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  last_message_at: new Date().toISOString()
                })
                .select()
                .single();

              // Save message record
              if (newThread) {
                await supabase
                  .from('messages')
                  .insert({
                    user_id: msg.user_id,
                    thread_id: newThread.id,
                    lead_id: msg.lead_id,
                    direction: 'outbound',
                    content: msg.body,
                    status: 'sent',
                    created_at: new Date().toISOString()
                  });
              }
            }

            sentCount++;
          } else {
            throw new Error(result.message || 'Twilio send failed');
          }
        } else if (msg.channel === 'email') {
          // TODO: Add email sending logic
          throw new Error('Email sending not yet implemented');
        }
      } catch (error) {
        // Mark message as failed
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('id', msg.id);

        failedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: messagesToSend.length,
      sent: sentCount,
      failed: failedCount,
      message: `Processed ${messagesToSend.length} scheduled messages`,
    });
  } catch (error) {
    console.error("Error sending scheduled messages:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process scheduled messages" },
      { status: 500 }
    );
  }
}

// POST endpoint for manual testing
export async function POST(req: NextRequest) {
  return GET(req);
}

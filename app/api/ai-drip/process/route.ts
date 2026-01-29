// API Route: Process AI Drips (Cron Job)
// Processes drips that are ready to send follow-up messages
// STRICT RULE: No messages after 9pm EST - this rule can NEVER be broken

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// STRICT RULE: No messages after 9pm EST - push to next day at 9am EST
function isInQuietHours(): boolean {
  const now = new Date();
  // Convert to EST (UTC-5)
  const estOffset = -5 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();

  // Quiet hours: 9pm (21:00) to 9am (09:00) EST
  return estHour >= 21 || estHour < 9;
}

function getNext9amEST(): Date {
  const now = new Date();
  // Convert to EST
  const estOffset = -5 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();

  const nextDay = new Date(now);
  if (estHour >= 21) {
    // After 9pm - move to next day
    nextDay.setDate(nextDay.getDate() + 1);
  }
  // Set to 9am EST (14:00 UTC)
  nextDay.setUTCHours(14, 0, 0, 0);
  return nextDay;
}

function adjustForQuietHours(date: Date): Date {
  // Convert to EST (UTC-5)
  const estOffset = -5 * 60;
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));
  const estHour = estDate.getHours();

  // If after 9pm (21:00) EST or before 9am EST, push to 9am next day
  if (estHour >= 21 || estHour < 9) {
    const nextDay = new Date(date);
    if (estHour >= 21) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    // Set to 9am EST (14:00 UTC)
    nextDay.setUTCHours(14, 0, 0, 0);
    return nextDay;
  }

  return date;
}

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret (optional but recommended)
    const cronSecret = req.headers.get('x-cron-secret');
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      // Allow without secret for testing, but log warning
      console.warn('AI Drip process called without valid cron secret');
    }

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    // Get drips ready to process
    const now = new Date().toISOString();
    const { data: drips, error: fetchError } = await supabaseAdmin
      .from('ai_drips')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_at', now)
      .order('next_send_at', { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error('Error fetching drips:', fetchError);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (!drips || drips.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No drips ready to process' });
    }

    // STRICT RULE: If we're in quiet hours (9pm-9am EST), do NOT send ANY messages
    // Instead, update all pending drips to send at 9am EST tomorrow
    if (isInQuietHours()) {
      const next9am = getNext9amEST();
      console.log(`🌙 Quiet hours active (9pm-9am EST). Rescheduling ${drips.length} drips to ${next9am.toISOString()}`);

      for (const drip of drips) {
        await supabaseAdmin
          .from('ai_drips')
          .update({
            next_send_at: next9am.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', drip.id);
      }

      return NextResponse.json({
        success: true,
        processed: 0,
        rescheduled: drips.length,
        message: `Quiet hours (9pm-9am EST) - rescheduled ${drips.length} drips to 9am EST`,
        nextSendAt: next9am.toISOString(),
      });
    }

    console.log(`📬 Processing ${drips.length} AI drips`);

    let processed = 0;
    let errors = 0;

    for (const drip of drips) {
      try {
        // Check if expired or max messages reached
        const isExpired = drip.expires_at && new Date(drip.expires_at) <= new Date();
        const maxReached = drip.max_messages && drip.messages_sent >= drip.max_messages;

        if (isExpired || maxReached) {
          await supabaseAdmin
            .from('ai_drips')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', drip.id);
          console.log(`✅ Drip ${drip.id} completed (${isExpired ? 'expired' : 'max messages'})`);
          continue;
        }

        // Get conversation history for context
        const { data: messages } = await supabaseAdmin
          .from('messages')
          .select('body, content, direction, created_at')
          .eq('thread_id', drip.thread_id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Check if there's been a reply since the drip started
        const recentInbound = messages?.find(m =>
          (m.direction === 'inbound' || m.direction === 'in') &&
          new Date(m.created_at) > new Date(drip.started_at)
        );

        if (recentInbound) {
          // Client replied - stop the drip and cancel remaining messages
          await supabaseAdmin
            .from('ai_drips')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', drip.id);

          // Cancel remaining scheduled messages
          await supabaseAdmin
            .from('ai_drip_messages')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('drip_id', drip.id)
            .eq('status', 'scheduled');

          console.log(`✅ Drip ${drip.id} completed (client replied)`);
          continue;
        }

        // Get the next scheduled message from pre-generated messages
        const { data: nextMessage, error: msgError } = await supabaseAdmin
          .from('ai_drip_messages')
          .select('*')
          .eq('drip_id', drip.id)
          .eq('status', 'scheduled')
          .order('message_number', { ascending: true })
          .limit(1)
          .single();

        let followUpMessage: string;

        if (nextMessage) {
          // Use pre-generated message
          followUpMessage = nextMessage.content;
        } else {
          // Fallback: Generate AI message if no pre-generated ones exist
          const conversationText = (messages || [])
            .reverse()
            .slice(-5)
            .map(m => `${m.direction === 'inbound' || m.direction === 'in' ? 'Customer' : 'Agent'}: ${m.body || m.content || ''}`)
            .join('\n');

          const aiPrompt = `You are a helpful sales agent following up with a customer who hasn't responded. This is follow-up #${drip.messages_sent + 1}.

Recent conversation:
${conversationText}

Generate a brief, friendly follow-up message (under 160 characters for SMS). Be persistent but not pushy. Vary your approach from previous messages. Do not repeat the same message. End with a question or call-to-action.`;

          const aiResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com'}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: aiPrompt }],
              model: 'gpt-4o-mini'
            }),
          });

          const aiData = await aiResponse.json();

          if (!aiResponse.ok || !aiData.ok || !aiData.reply) {
            throw new Error(aiData.error || 'Failed to generate AI message');
          }

          followUpMessage = aiData.reply.trim();
        }

        // Send the message via Telnyx
        const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com'}/api/telnyx/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: drip.phone_number,
            from: drip.from_number,
            message: followUpMessage,
            userId: drip.user_id,
            threadId: drip.thread_id,
            isAutomated: true,
            automationSource: 'ai_drip',
          }),
        });

        const sendData = await sendResponse.json();

        if (!sendResponse.ok || !sendData.success) {
          throw new Error(sendData.error || 'Failed to send message');
        }

        // Mark pre-generated message as sent (if using pre-generated)
        if (nextMessage) {
          await supabaseAdmin
            .from('ai_drip_messages')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_id: sendData.messageId || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', nextMessage.id);
        }

        // Calculate next send time - MUST respect quiet hours
        let nextSendAt = new Date();
        nextSendAt.setHours(nextSendAt.getHours() + drip.interval_hours);
        nextSendAt = adjustForQuietHours(nextSendAt); // Enforce quiet hours

        // Update drip
        await supabaseAdmin
          .from('ai_drips')
          .update({
            messages_sent: drip.messages_sent + 1,
            next_send_at: nextSendAt.toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', drip.id);

        console.log(`✅ Drip ${drip.id}: Sent message ${drip.messages_sent + 1}/${drip.max_messages || '∞'}`);
        processed++;

      } catch (error: any) {
        console.error(`❌ Error processing drip ${drip.id}:`, error.message);

        // Update drip with error
        await supabaseAdmin
          .from('ai_drips')
          .update({
            last_error: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', drip.id);

        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: drips.length,
    });

  } catch (error: any) {
    console.error('Error in AI drip processor:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Also allow GET for testing
export async function GET(req: NextRequest) {
  return POST(req);
}

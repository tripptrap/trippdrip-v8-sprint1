import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
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

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

/**
 * Process AI Drip messages
 * Generates and sends AI follow-up messages for active drips
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

    // Skip during quiet hours
    if (isInQuietHours()) {
      return NextResponse.json({
        ok: true,
        message: 'Quiet hours — skipping AI drips',
        processed: 0,
      });
    }

    const now = new Date();

    // Get drips ready to send using the database function
    const { data: drips, error: fetchError } = await supabaseAdmin
      .rpc('get_ai_drips_ready_to_send');

    if (fetchError) {
      console.error('Error fetching AI drips:', fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!drips || drips.length === 0) {
      return NextResponse.json({ ok: true, message: 'No AI drips to process', processed: 0 });
    }

    let processed = 0;
    let sent = 0;
    let completed = 0;
    let errors = 0;

    for (const drip of drips) {
      processed++;

      try {
        // Check if drip has expired
        if (drip.expires_at && new Date(drip.expires_at) < now) {
          await supabaseAdmin
            .from('ai_drips')
            .update({ status: 'completed' })
            .eq('id', drip.id);
          completed++;
          continue;
        }

        // Check if max messages reached
        if (drip.max_messages && drip.messages_sent >= drip.max_messages) {
          await supabaseAdmin
            .from('ai_drips')
            .update({ status: 'completed' })
            .eq('id', drip.id);
          completed++;
          continue;
        }

        // Get conversation context for AI generation
        const { data: recentMessages } = await supabaseAdmin
          .from('messages')
          .select('body, direction, created_at')
          .eq('thread_id', drip.thread_id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Check if client has replied since drip started
        const clientReplies = recentMessages?.filter(m =>
          m.direction === 'inbound' &&
          new Date(m.created_at) > new Date(drip.started_at)
        );

        if (clientReplies && clientReplies.length > 0) {
          // Client replied - stop the drip
          await supabaseAdmin
            .from('ai_drips')
            .update({ status: 'completed' })
            .eq('id', drip.id);
          completed++;
          console.log(`⏹️ AI Drip ${drip.id}: Client replied, stopping drip`);
          continue;
        }

        // Get lead info for personalization
        const { data: thread } = await supabaseAdmin
          .from('threads')
          .select('lead_id')
          .eq('id', drip.thread_id)
          .single();

        let leadName = '';
        if (thread?.lead_id) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('first_name, last_name')
            .eq('id', thread.lead_id)
            .single();
          leadName = lead?.first_name || '';
        }

        // Build conversation summary for AI context
        const conversationSummary = recentMessages
          ?.reverse()
          .map(m => `${m.direction === 'inbound' ? 'Client' : 'Agent'}: ${m.body}`)
          .join('\n') || '';

        // Generate AI follow-up message
        const { generateFollowUpMessage } = await import('@/lib/ai/openai');
        const aiMessage = await generateFollowUpMessage(
          {
            firstName: leadName,
            status: 'active',
            daysSinceContact: Math.floor((now.getTime() - new Date(drip.started_at).getTime()) / (1000 * 60 * 60 * 24)),
          },
          conversationSummary
        );

        if (!aiMessage) {
          console.error(`AI Drip ${drip.id}: Failed to generate message`);
          await supabaseAdmin
            .from('ai_drips')
            .update({ last_error: 'Failed to generate AI message' })
            .eq('id', drip.id);
          errors++;
          continue;
        }

        // Apply guardrails
        const { applyGuardrails, DEFAULT_GUARDRAILS } = await import('@/lib/ai/guardrails');
        const guardrailResult = applyGuardrails(aiMessage, DEFAULT_GUARDRAILS);
        if (!guardrailResult.passed) {
          console.warn(`AI Drip ${drip.id}: Message blocked by guardrails`);
          await supabaseAdmin
            .from('ai_drips')
            .update({ last_error: 'Message blocked by guardrails' })
            .eq('id', drip.id);
          errors++;
          continue;
        }

        // Send via Telnyx
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
        const sendResponse = await fetch(`${baseUrl}/api/telnyx/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: drip.phone_number,
            from: drip.from_number,
            message: guardrailResult.message,
            userId: drip.user_id,
            threadId: drip.thread_id,
            isAutomated: true,
            automationSource: 'ai_drip',
          }),
        });

        const sendData = await sendResponse.json();

        if (!sendResponse.ok || !sendData.success) {
          console.error(`AI Drip ${drip.id}: Failed to send:`, sendData.error);
          await supabaseAdmin
            .from('ai_drips')
            .update({ last_error: sendData.error || 'Failed to send' })
            .eq('id', drip.id);
          errors++;
          continue;
        }

        sent++;

        // Deduct credits (2 points per AI message)
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('credits')
          .eq('id', drip.user_id)
          .single();

        if (userData) {
          await supabaseAdmin
            .from('users')
            .update({ credits: Math.max(0, (userData.credits || 0) - 2) })
            .eq('id', drip.user_id);
        }

        // Update drip record
        const newMessagesSent = drip.messages_sent + 1;
        const nextSendAt = new Date(now.getTime() + drip.interval_hours * 60 * 60 * 1000);

        // Check if this completes the drip
        if (drip.max_messages && newMessagesSent >= drip.max_messages) {
          await supabaseAdmin
            .from('ai_drips')
            .update({
              messages_sent: newMessagesSent,
              status: 'completed',
              last_error: null,
            })
            .eq('id', drip.id);
          completed++;
        } else {
          await supabaseAdmin
            .from('ai_drips')
            .update({
              messages_sent: newMessagesSent,
              next_send_at: nextSendAt.toISOString(),
              last_error: null,
            })
            .eq('id', drip.id);
        }

        // Log the AI drip message
        await supabaseAdmin.from('ai_drip_messages').insert({
          drip_id: drip.id,
          content: guardrailResult.message,
          scheduled_for: now.toISOString(),
          sent_at: now.toISOString(),
          status: 'sent',
        });

        console.log(`✅ AI Drip ${drip.id}: Sent message ${newMessagesSent}/${drip.max_messages || '∞'}`);

        // Small delay between sends
        await new Promise(r => setTimeout(r, 100));

      } catch (err) {
        console.error(`AI Drip ${drip.id}: Error processing:`, err);
        errors++;
      }
    }

    console.log(`🤖 AI Drip cron: processed=${processed}, sent=${sent}, completed=${completed}, errors=${errors}`);

    return NextResponse.json({
      ok: true,
      processed,
      sent,
      completed,
      errors,
    });

  } catch (error: any) {
    console.error('Error in AI drip cron:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/cron/process-ai-drips',
    description: 'Processes AI drip campaigns and sends AI-generated follow-up messages',
    method: 'POST to trigger processing',
  });
}

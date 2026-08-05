import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { alertAdminsThrottled } from '@/lib/alerting';
import { requireCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Timing-safe comparison to prevent timing attacks

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
async function handleCron(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    const denied = await requireCronAuth(req);
    if (denied) return denied;

    // Quiet hours are checked per-drip below (#50) rather than as one global
    // gate. The old check used a hardcoded 9pm-9am *Eastern* window for every
    // user and recipient, which both ignored the sender's configured hours and
    // — more importantly — sent to a California lead at 6am their time.

    const now = new Date();

    // Read due drips directly rather than through get_ai_drips_ready_to_send().
    //
    // That function is the third and last of the `SECURITY DEFINER RETURNS SETOF
    // <table>` helpers, and the pattern is confirmed broken over PostgREST (#61):
    // measured in a single production request, the sibling function returned 0
    // rows while a direct query for the same predicate returned the due row —
    //
    //     messages direct vs rpc: {"direct":1,"rpc":0}
    //
    // — with no error either time. There is no reason to expect this one behaves
    // differently, and the failure mode is silent, so it is inlined too.
    const nowIso = now.toISOString();
    const { data: dripRows, error: fetchError } = await supabaseAdmin
      .from('ai_drips')
      .select('*')
      .eq('status', 'active')
      .lte('next_send_at', nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('next_send_at', { ascending: true })
      .limit(200);

    // `messages_sent < max_messages` compares two columns, which PostgREST
    // cannot express as a filter, so it is applied here. The 200 above is a
    // read cap; the function's own LIMIT 50 is preserved after filtering so a
    // batch of exhausted drips cannot starve the ones still owed a message.
    const drips = (dripRows || [])
      .filter((d: any) => d.max_messages == null || (d.messages_sent ?? 0) < d.max_messages)
      .slice(0, 50);

    if (fetchError) {
      console.error('Error fetching AI drips:', fetchError);
      await alertAdminsThrottled({
        key: 'cron_fetch_failed:process-ai-drips',
        title: 'AI drips are not being sent',
        body: `The ai_drips query is failing (${fetchError.message}), so no AI follow-up has gone out since this started.`,
        data: { route: 'cron/process-ai-drips', query: 'ai_drips', error: fetchError.message },
      });
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!drips || drips.length === 0) {
      return NextResponse.json({ ok: true, message: 'No AI drips to process', processed: 0 });
    }

    let processed = 0;
    let sent = 0;
    let completed = 0;
    let errors = 0;
    let deferred = 0;   // blocked by quiet hours — will retry on a later run

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
        // #64: scope to the drip's owner. This read feeds conversationSummary,
        // which is interpolated straight into the AI prompt — so an unscoped
        // read let a message written into this thread by another tenant steer
        // what this user's AI says to their lead. ai/generate-follow-up already
        // filters this way; this query was the one that didn't.
        const { data: recentMessages } = await supabaseAdmin
          .from('messages')
          .select('body, direction, created_at')
          .eq('thread_id', drip.thread_id)
          .eq('user_id', drip.user_id)
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
        let leadState: string | null = null;
        if (thread?.lead_id) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('first_name, last_name, state')
            .eq('id', thread.lead_id)
            .single();
          leadName = lead?.first_name || '';
          leadState = lead?.state ?? null;
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

        // Opt-out + quiet-hours gate (#50), using the lead's local time where
        // their state is known. A block here is retryable — next_send_at is
        // left untouched so the drip is simply picked up on a later run.
        const guard = await checkSmsAllowed(supabaseAdmin, drip.user_id, drip.phone_number, {
          enforceQuietHours: true,
          recipientState: leadState,
          context: { source: 'ai_drip', drip_id: drip.id },
        });

        if (!guard.allowed) {
          console.log(`AI Drip ${drip.id}: skipping — ${guard.reason} (${guard.detail})`);
          if (!guard.retryable) {
            // Permanent (DNC / opted out) — stop the drip rather than retrying.
            await supabaseAdmin
              .from('ai_drips')
              .update({ status: 'completed', last_error: `Stopped: ${guard.detail}` })
              .eq('id', drip.id);
          }
          deferred++;
          continue;
        }

        // #71: claim the drip BEFORE sending. This used to advance
        // messages_sent/next_send_at afterwards, so a failed update left BOTH
        // unchanged — next_send_at stayed in the past and the counter never
        // moved, meaning max_messages could never engage as a backstop and the
        // same message went out every 10 minutes indefinitely.
        //
        // Conditional on the counter we read, so two workers can't both take it.
        const claimedMessagesSent = drip.messages_sent + 1;
        const claimedNextSendAt = new Date(now.getTime() + drip.interval_hours * 60 * 60 * 1000);

        const { data: claimed, error: claimError } = await supabaseAdmin
          .from('ai_drips')
          .update({
            messages_sent: claimedMessagesSent,
            next_send_at: claimedNextSendAt.toISOString(),
          })
          .eq('id', drip.id)
          .eq('messages_sent', drip.messages_sent)
          .select('id')
          .maybeSingle();

        if (claimError || !claimed) {
          console.log(`AI Drip ${drip.id}: could not claim (already taken or update failed) — skipping to avoid a double send`);
          continue;
        }

        // Send via Telnyx
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
        const sendResponse = await fetch(`${baseUrl}/api/telnyx/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.CRON_SECRET || '',
          },
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
          // The claim above already advanced messages_sent and next_send_at, so
          // this attempt is consumed rather than retried immediately. That's the
          // deliberate trade from #44 — a skipped message is cheaper than an
          // unbounded resend loop. Recorded in last_error so it's visible rather
          // than looking like a message that simply never went out.
          console.error(`AI Drip ${drip.id}: Failed to send (attempt consumed, next try at ${claimedNextSendAt.toISOString()}):`, sendData.error);
          await supabaseAdmin
            .from('ai_drips')
            .update({ last_error: `Failed to send: ${sendData.error || 'unknown error'} (attempt consumed)` })
            .eq('id', drip.id);
          errors++;
          continue;
        }

        sent++;

        // Deduct credits (2 points per AI message) via the atomic RPC (#45).
        // This was a read-then-write, so two concurrent deductions could
        // interleave and lose one — process-scheduled already uses the RPC for
        // exactly this reason (see its CRIT-1 comment).
        const { error: deductError } = await supabaseAdmin.rpc('deduct_credits', {
          user_id: drip.user_id,
          amount: 2,
          reason: 'AI drip follow-up',
        });

        if (deductError) {
          // Message already sent, so this can't be undone — but it must be
          // visible rather than silently free.
          console.error(`❌ AI drip ${drip.id} sent but credits NOT deducted for user ${drip.user_id}:`, deductError);
        }

        // Counter and next_send_at were already advanced by the claim above;
        // this only records the outcome.
        const newMessagesSent = claimedMessagesSent;
        const nextSendAt = claimedNextSendAt;

        // Check if this completes the drip
        if (drip.max_messages && newMessagesSent >= drip.max_messages) {
          await supabaseAdmin
            .from('ai_drips')
            .update({
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
      deferred,
    });

  } catch (error: any) {
    console.error('Error in AI drip cron:', error);
    await alertAdminsThrottled({
      key: 'cron_run_failed:process-ai-drips',
      title: 'AI drip cron is failing',
      body: `The AI drip cron threw and processed nothing: ${error.message}. AI follow-ups are stalled until this is fixed.`,
      data: { route: 'cron/process-ai-drips', error: error.message },
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Vercel Cron invokes the scheduled path with an HTTP **GET** — confirmed
// against the docs. This route previously exported the real handler as POST
// and a metadata-only stub as GET, so every scheduled run hit the stub, got
// 200 back, and did nothing. Both methods now run the same handler (#97).
export const GET = handleCron;
export const POST = handleCron;

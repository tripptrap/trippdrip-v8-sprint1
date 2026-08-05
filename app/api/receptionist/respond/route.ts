// API Route: Generate Receptionist Response
// Internal API called from SMS webhook when receptionist mode is triggered

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReceptionistResponse } from '@/lib/receptionist/generateResponse';
import { ReceptionistSettings, ContactType, ReceptionistResponseParams } from '@/lib/receptionist/types';
import { isInternalCaller } from '@/lib/cronAuth';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { createNotification } from '@/lib/createNotification';

// Use service role client for internal operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  // Set once this invocation has claimed the right to answer (see the claim
  // below). A closure rather than a (client, id) pair so the Supabase client
  // stays in the scope that created it — declared out here only so the
  // `finally` can hand the conversation back no matter which of the route's
  // many early returns fires.
  let releaseReplyClaim: (() => Promise<void>) | null = null;

  try {
    // MED-5: Internal-only endpoint — require x-internal-secret to prevent
    // unauthenticated callers from burning any user's AI credits. Constant-time
    // for the same reason the cron routes are (#96) — it is the same secret.
    if (!isInternalCaller(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      userId,
      threadId,
      phoneNumber,
      inboundMessage,
      contactType,
      leadId,
      leadName,
      toPhoneNumber, // The user's Telnyx number that received the message
      draftOnly,     // If true, store AI draft on thread instead of auto-sending (suggest mode)
      flowContext,   // Flow qualification context — passed when lead has an active flow
    } = await req.json();

    if (!userId || !phoneNumber || !inboundMessage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get user's receptionist settings
    const { data: settings, error: settingsError } = await supabase
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings || !settings.enabled) {
      return NextResponse.json({
        success: false,
        error: 'Receptionist mode not enabled or configured',
      }, { status: 400 });
    }

    // ── The AI must not ask what business it works for ────────────────────
    //
    // Everything the AI knows about the business comes from
    // receptionist_settings.identity. That JSONB is empty until someone fills
    // in the Receptionist form, so a brand-new account's AI opens with
    // businessName = 'this business' and no idea what it sells.
    //
    // Meanwhile the account already answered this at signup. The industry sits
    // in auth user_metadata, the business name in users.business_name, and the
    // vertical in user_10dlc_registrations — onboarding reads the industry to
    // seed tags and flows and then never persists it anywhere the AI can see.
    //
    // Observed live: a flow asked an insurance customer "what kind of business
    // do you run?" while the account's own industry was 'insurance'.
    //
    // So anything the operator has not explicitly set is filled from what the
    // account already told us. Explicit settings always win — this only fills
    // blanks, it never overwrites.
    const { data: acct } = await supabase
      .from('users')
      .select('business_name')
      .eq('id', userId)
      .maybeSingle();

    let metaIndustry: string | null = null;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      metaIndustry = (authUser?.user?.user_metadata as any)?.industry ?? null;
    } catch {
      // Non-fatal: the AI simply keeps whatever identity it already had.
    }

    const industry = settings.industry || metaIndustry || null;
    settings.industry = industry;
    settings.identity = {
      ...((acct as { business_name?: string } | null)?.business_name
    ? { businessName: (acct as { business_name?: string }).business_name }
    : {}),
      ...(industry ? { industryContext: industry } : {}),
      // Operator-set values last, so they override the inferred ones.
      ...(settings.identity || {}),
    };

    // Check user has premium subscription
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier, credits')
      .eq('id', userId)
      .single();

    const isPaid = userData?.subscription_tier === 'growth' || userData?.subscription_tier === 'scale';
    if (!isPaid) {
      return NextResponse.json({
        success: false,
        error: 'Paid subscription required',
      }, { status: 403 });
    }

    // Check credits BEFORE generating AI response (avoid burning OpenAI cost)
    const currentCredits = userData?.credits || 0;
    const estimatedCost = 2; // Minimum points for AI response
    if (currentCredits < estimatedCost) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient credits',
      }, { status: 402 });
    }

    // Check rate limits before generating
    const { applyGuardrails, DEFAULT_GUARDRAILS, checkRateLimit } = await import('@/lib/ai/guardrails');
    const rateCheck = await checkRateLimit(supabase, userId, DEFAULT_GUARDRAILS);
    if (!rateCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: rateCheck.reason || 'Rate limit exceeded',
      }, { status: 429 });
    }

    // ── One reply per burst ──────────────────────────────────────────────────
    //
    // People text in bursts. On 2026-08-04 the contact sent "Yes please" and,
    // three seconds later, "Why not?" — and got two replies in the same second,
    // plus two follow_ups rows for one request. Both inbound webhooks ran this
    // route, neither knew about the other.
    //
    // Claiming the conversation has to be atomic. Checking "has anything been
    // sent since?" and then sending is a race, and those two replies landed in
    // the SAME SECOND — a read check would have let both through. This is a
    // conditional UPDATE instead: Postgres serialises the two writers on the row
    // lock, the second re-evaluates the WHERE against the winner's committed row
    // and matches nothing. One caller proceeds, the rest stand down.
    //
    // "Free" is the sentinel `-infinity`, never NULL, so this is one comparison
    // rather than `(x IS NULL OR x < now())`. That matters: the or() form is
    // rejected by PostgREST with "column threads.ai_reply_lock_until does not
    // exist" even though it does — see the migration for the full write-up.
    if (threadId) {
      const { data: claim, error: claimError } = await supabase
        .from('threads')
        // 45s comfortably covers the pacing delay + generation + send. A
        // timestamp, not a boolean, so an invocation that dies mid-reply cannot
        // mute the conversation permanently — the claim just expires.
        .update({ ai_reply_lock_until: new Date(Date.now() + 45_000).toISOString() })
        .eq('id', threadId)
        .eq('user_id', userId)
        .lt('ai_reply_lock_until', new Date().toISOString())
        .select('id');

      // supabase-js returns { error }; it does not throw. Treat a failed claim
      // as "someone else has it" rather than replying anyway — a duplicate reply
      // to a real contact is worse than a missed one, and the inbound that
      // actually holds the claim is about to answer.
      if (claimError) {
        console.error('🤖 Receptionist: could not claim thread, standing down:', claimError.message);
        return NextResponse.json({ success: false, error: 'Could not claim thread' }, { status: 409 });
      }
      if (!claim || claim.length === 0) {
        console.log('🤖 Receptionist: another reply is already in flight for this thread — standing down');
        return NextResponse.json({ success: true, skipped: 'reply_already_in_flight' });
      }

      releaseReplyClaim = async () => {
        const { error: releaseError } = await supabase
          .from('threads')
          // Back to the free sentinel, not NULL — the column is NOT NULL.
          .update({ ai_reply_lock_until: '-infinity' })
          .eq('id', threadId);
        // Not fatal — the claim expires on its own. Worth knowing about.
        if (releaseError) {
          console.error('🤖 Receptionist: failed to release reply claim:', releaseError.message);
        }
      };
    }

    // Answer at human speed, not machine speed.
    //
    // Replies were landing 3 seconds after the inbound. Nobody types that fast,
    // and an instant answer is the clearest tell that a person is talking to a
    // bot — more obvious than anything in the wording.
    //
    // 10-20s, varied per message so the gap is not itself a pattern.
    //
    // This waits BEFORE reading the conversation, not after generating. That
    // ordering is the other half of the burst fix: whatever the contact sends
    // during the pause is already in the history below, so the single reply
    // answers the whole burst instead of only its first message.
    const replyDelayMs = 10_000 + Math.floor(Math.random() * 10_000);
    console.log(`⏳ Holding the reply ${Math.round(replyDelayMs / 1000)}s so it reads as typed`);
    await new Promise(resolve => setTimeout(resolve, replyDelayMs));

    // Get conversation history from thread
    let conversationHistory: Array<{ direction: string; body: string }> = [];
    if (threadId) {
      // Scoped to the owner (#64). This history is fed to the receptionist AI,
      // so an unscoped read would let a message written into this thread by
      // another tenant steer the reply. The caller is internal-only, but the
      // filter is free and this is the same class the AI drip cron had.
      const { data: messages } = await supabase
        .from('messages')
        // `content` as well as `body`: some paths write only one of them, and a
        // history row with a null body gave the model a blank turn.
        .select('direction, body, content, created_at')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        // NEWEST 20, then reversed below.
        //
        // This was ascending — the OLDEST 20 messages of a 97-message thread, all
        // from days earlier. The AI never saw the conversation it was in. That is
        // the single cause of every loop reported today: repeated openers, asking
        // the same question twice, and answering "Yes please" with "What do you
        // need help with?" — it had no idea what had just been offered.
        .order('created_at', { ascending: false })
        .limit(20);

      if (messages) {
        // Back to chronological — the model needs the conversation in the order
        // it happened, and the query above fetches newest-first to get the RIGHT
        // twenty rather than the first twenty.
        conversationHistory = [...messages]
          .reverse()
          .map((m: any) => ({ ...m, body: m.body ?? m.content ?? '' }))
          .filter((m: any) => m.body.trim().length > 0);
      }
    }

    // Generate AI response
    const params: ReceptionistResponseParams = {
      userId,
      threadId,
      phoneNumber,
      inboundMessage,
      contactType: contactType as ContactType,
      leadId,
      leadName,
      conversationHistory,
      flowContext: flowContext || null,
    };

    const result = await generateReceptionistResponse(params, settings as ReceptionistSettings);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }

    // HIGH-8: Apply guardrails BEFORE deducting credits — user should not be
    // charged for AI responses that are blocked and never sent.
    const guardrailResult = applyGuardrails(result.response || '', DEFAULT_GUARDRAILS);
    if (!guardrailResult.passed) {
      console.warn('AI response blocked by guardrails:', guardrailResult.violations);
      return NextResponse.json({
        success: false,
        error: 'AI response blocked by safety guardrails',
        violations: guardrailResult.violations,
      }, { status: 422 });
    }

    // SUGGEST MODE: store draft on thread instead of sending (no credit charge for drafts)
    if (draftOnly && threadId) {
      await supabase
        .from('threads')
        .update({ pending_ai_draft: guardrailResult.message })
        .eq('id', threadId);

      console.log('🤖 Suggest mode: stored draft on thread', threadId);
      return NextResponse.json({
        success: true,
        response: guardrailResult.message,
        responseType: result.responseType,
        pointsUsed: 0,
        messageSent: false,
        isDraft: true,
      });
    }

    // ── DNC, opt-out, suspension and quiet hours ──────────────────────────
    //
    // send-sms wraps checkSmsAllowed in `if (!internalCaller)`, and this route
    // authenticates with x-internal-secret — so it skipped the entire guard.
    // Both drip crons call it themselves for exactly this reason
    // (process-drips:350, process-ai-drips:222); the Receptionist never did.
    //
    // That was harmless only because the send below has never worked. Fixing
    // the body/message key in this same commit turns this path on, and without
    // this it would auto-reply to opted-out numbers, from suspended accounts,
    // at 3am in the recipient's local time — on the highest-volume automated
    // path in the product.
    //
    // enforceQuietHours is true: an unprompted AI reply is automated sending,
    // not a human pressing send. The recipient's state drives the window (#50).
    let recipientState: string | null = null;
    if (leadId) {
      const { data: stateLead } = await supabase
        .from('leads')
        .select('state')
        .eq('id', leadId)
        .eq('user_id', userId)
        .maybeSingle();
      recipientState = stateLead?.state ?? null;
    }

    const guard = await checkSmsAllowed(supabase, userId, phoneNumber, {
      // Answering someone who just messaged in. DNC, opt-out, suspension and
      // the per-account rate limits all still apply; quiet hours and the
      // per-contact cooldown do not — see GuardOptions.isReply.
      isReply: true,
      enforceQuietHours: true,
      recipientState,
      context: { source: 'receptionist', thread_id: threadId ?? null, lead_id: leadId ?? null },
    });

    if (!guard.allowed) {
      console.log(`🤖 Receptionist: send blocked — ${guard.reason}: ${guard.detail}`);
      return NextResponse.json({
        success: false,
        error: guard.detail || 'Send not allowed',
        reason: guard.reason,
        retryable: guard.retryable ?? false,
      }, { status: guard.reason === 'quiet_hours' || guard.reason === 'rate_limited' ? 429 : 403 });
    }

    // FULL AUTO MODE: send the SMS response using Telnyx
    const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/telnyx/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        to: phoneNumber,
        from: toPhoneNumber,
        // `message`, not `body`. /api/telnyx/send-sms destructures
        // `{ to, from, message, ... }` and rejects with
        // "Missing required fields: to, message" when it is absent.
        //
        // This said `body:`, so EVERY receptionist reply 400'd at the send and
        // the route returned "Failed to send response". The Receptionist has
        // never delivered a single message. Proven by posting this exact
        // shape to the live endpoint: 400, missing fields.
        message: guardrailResult.message,
        // System courtesy replies are free (owner's decision, 2026-08-04).
        //
        // after_hours and greeting are canned text with no model call, so they
        // already cost 0 AI points. They were still costing 1 SMS credit, which
        // meant an automatic "we're closed" the user never wrote showed up on
        // their statement. `pointsUsed === 0` is the signal — it means no model
        // ran — rather than a list of response types that would drift.
        //
        // send-sms only honours this from a verified internal caller, so it
        // cannot be used to send free SMS from a session.
        freeSystemMessage: result.pointsUsed === 0,
        userId,
        threadId,
        leadId,
        isAutomated: true,
      }),
    });

    const sendResult = await sendResponse.json();

    if (!sendResult.success) {
      console.error('Failed to send receptionist response:', sendResult.error);
      return NextResponse.json({
        success: false,
        // The real reason, not a generic string. The generic one is why the
        // body/message mismatch went unnoticed: the send replied "Missing
        // required fields: to, message" and this reported only "Failed to
        // send response".
        error: `Failed to send response: ${sendResult.error || 'unknown error'}`,
      }, { status: 500 });
    }

    // ── Hand it to a person, with a todo ──────────────────────────────────
    //
    // The Receptionist can answer and book; it cannot post insurance cards, look
    // up an account or correct a record. Without somewhere to put those, it just
    // kept asking clarifying questions — observed live, a customer asked three
    // times for their cards and was asked each time what they meant.
    //
    // The model marks its own reply with [[HANDOFF: ...]] when it decides a human
    // is needed; that marker is stripped before sending. Here it becomes a
    // follow-up the operator can see and tick off, plus a notification.
    //
    // Non-fatal by design: the customer has already been told someone will follow
    // up. Failing this request would not un-send that.
    if (result.handoff?.summary && leadId) {
      try {
        // reminder_type is constrained to manual|auto_no_response|auto_follow_up|
        // auto_callback — there is no 'ai_handoff' value, and an out-of-set write
        // would be rejected silently by supabase-js's { error } return.
        const { error: fuError } = await supabase.from('follow_ups').insert({
          user_id: userId,
          lead_id: leadId,
          title: result.handoff.summary,
          notes: `Asked by SMS: "${inboundMessage}"\n\nReceptionist replied: "${result.response}"`,
          // Due now: the contact is waiting, and a date in the future would hide
          // it from a list sorted by what is due.
          due_date: new Date().toISOString(),
          status: 'pending',
          priority: 'high',
          reminder_type: 'auto_follow_up',
        });
        if (fuError) console.error('Receptionist handoff: could not create the follow-up:', fuError);

        await createNotification(userId, 'ai_handoff', 'The receptionist needs you', result.handoff.summary, {
          lead_id: leadId,
          thread_id: threadId ?? null,
          phone_number: phoneNumber,
        });
      } catch (e) {
        console.error('Receptionist handoff failed:', e);
      }
    }

    // Charge AFTER a confirmed send, not before.
    //
    // The deduction used to run before the fetch, so every failed send still
    // took the user's credits — and since the send has never once succeeded,
    // that is every AI reply ever attempted. Charging for a message nobody
    // received is the same defect as the document-upload path fixed earlier.
    //
    // Deliberately does not block on a deduction error: the message has
    // already gone out, so failing here would report failure for something
    // that succeeded. A missed charge is the cheaper mistake.
    if (result.pointsUsed && result.pointsUsed > 0) {
      const { error: deductError } = await supabase.rpc('deduct_credits', {
        user_id: userId,
        amount: result.pointsUsed,
        reason: `Receptionist AI reply (${result.responseType || 'reply'})`
      });
      if (deductError) {
        console.error('Sent the reply but could not deduct credits:', deductError);
      }
    }

    // Log the interaction
    await supabase
      .from('receptionist_logs')
      .insert({
        user_id: userId,
        thread_id: threadId,
        lead_id: leadId,
        phone_number: phoneNumber,
        contact_type: contactType,
        inbound_message: inboundMessage,
        ai_response: result.response,
        response_type: result.responseType,
        points_used: result.pointsUsed || 0,
      });

    return NextResponse.json({
      success: true,
      response: result.response,
      responseType: result.responseType,
      pointsUsed: result.pointsUsed,
      messageSent: true,
    });

  } catch (error: any) {
    console.error('Receptionist respond error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  } finally {
    // Hand the conversation back the moment this reply is done, however it
    // ended. The claim expires by itself after 45s, but leaving it set would
    // ignore a genuinely new message that arrives inside that window — and this
    // route has a dozen early returns, so a `finally` is the only placement that
    // covers all of them.
    if (releaseReplyClaim) await releaseReplyClaim();
  }
}

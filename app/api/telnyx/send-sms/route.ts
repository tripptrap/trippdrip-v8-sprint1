// API Route: Send SMS via Telnyx
// This sends outbound SMS messages through the Telnyx API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { resolveFromNumber } from '@/lib/resolveFromNumber';
import { moderateWithPolicy } from '@/lib/smsModeration';
import { isInternalCaller } from '@/lib/cronAuth';
import { isFirstContact, appendOptOut } from '@/lib/optOutFooter';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    // `isAutomated` / `automationSource` were being SENT by callers and silently
    // discarded — the receptionist passes isAutomated:true and it never reached
    // the row, so an AI-sent message was indistinguishable from one the user
    // typed. That matters for "what did the AI say on my behalf" and for any
    // analytics separating automated from human traffic.
    const {
      to, from, message, userId: passedUserId, threadId, mediaUrls, leadId, campaignId,
      isAutomated, automationSource, freeSystemMessage,
    } = await req.json();

    // Get current user from session if userId not passed
    let userId = passedUserId;
    if (!userId) {
      try {
        const serverClient = await createServerClient();
        const { data: { user } } = await serverClient.auth.getUser();
        userId = user?.id;
      } catch (e) {
        console.log('Could not get user from session:', e);
      }
    }

    // CRIT-2: Auth gate — require valid session OR x-internal-secret header for internal callers
    // Internal callers (cron, webhook, receptionist) must pass x-internal-secret: CRON_SECRET.
    // Constant-time: this is the same CRON_SECRET the cron routes compare, and
    // comparing it with === here would undo their care (#96).
    const internalCaller = isInternalCaller(req);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If userId was supplied in the request body, the caller must be an authenticated internal service
    if (passedUserId && !internalCaller) {
      console.error('❌ Rejected: body-supplied userId without valid x-internal-secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Telnyx API key not configured' },
        { status: 500 }
      );
    }

    if (!messagingProfileId) {
      return NextResponse.json(
        { error: 'Telnyx messaging profile ID not configured' },
        { status: 500 }
      );
    }

    // IMPORTANT: Validate that the user owns the "from" number
    // This prevents users from sending SMS from numbers they don't own
    if (from && userId && supabaseAdmin) {
      const { data: ownedNumber, error: ownershipError } = await supabaseAdmin
        .from('user_telnyx_numbers')
        .select('id')
        .eq('user_id', userId)
        .eq('phone_number', from)
        .eq('status', 'active')
        .single();

      if (ownershipError || !ownedNumber) {
        console.error('❌ User attempted to send from unowned number:', { userId, from });
        return NextResponse.json(
          { error: 'You do not have permission to send from this phone number' },
          { status: 403 }
        );
      }
    }

    // Geo-proximity routing: pick closest number when no explicit 'from' provided
    let resolvedFrom = from;
    if (!resolvedFrom && userId && supabaseAdmin) {
      let leadZipCode: string | null = null;

      // Look up lead zip code by leadId
      if (leadId) {
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('zip_code')
          .eq('id', leadId)
          .single();
        leadZipCode = lead?.zip_code || null;
      }

      // Fallback: look up lead by phone number
      if (!leadZipCode && !leadId) {
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('zip_code')
          .eq('user_id', userId)
          .eq('phone', to)
          .limit(1)
          .single();
        leadZipCode = lead?.zip_code || null;
      }

      // Shared resolver rather than selectClosestNumber directly, so this path
      // also honours the user's mode, locks and rests (#122).
      // `toPhone` matters as much as the zip (#129). Without it the resolver
      // cannot see that a conversation with this person already exists, so it
      // re-picks from scratch every time and a thread can change number
      // mid-conversation — which breaks threading on the handset and reads as a
      // stranger. This is the route the composer, bulk send, the receptionist
      // and both drip crons all fetch into, so omitting it defeated the pin on
      // the highest-volume path in the app.
      const resolved = await resolveFromNumber(supabaseAdmin, userId, { leadZipCode, toPhone: to });

      // The "first active number" fallback that used to live here is gone (#125).
      // It ran whenever the resolver declined and took the OLDEST active number
      // straight from the table — ignoring rest, lock, geo and mode, every rule
      // the resolver exists to apply. Because this route is also what
      // receptionist/respond, process-drips and process-ai-drips fetch into,
      // resting a number did not stop it being used on any of them. The Rest
      // button on the Phone Numbers page was, on these paths, decorative.
      //
      // Declining to send is the correct answer: if every number is rested the
      // resolver already falls back to the primary itself, deliberately, so
      // reaching here means something is genuinely wrong.
      if (!resolved.ok) {
        return NextResponse.json(
          { error: resolved.detail, reason: resolved.reason, retryable: resolved.retryable },
          { status: resolved.retryable ? 503 : 400 }
        );
      }

      resolvedFrom = resolved.number;
      console.log('📍 Geo-routed to number:', resolvedFrom, 'for zip:', leadZipCode);
    }

    // An explicit `from` that failed the ownership check above, or a caller that
    // passed an empty string.
    if (!resolvedFrom) {
      return NextResponse.json(
        { error: 'No phone number available. Please claim a phone number first.' },
        { status: 400 }
      );
    }

    // Fetch user's settings (opt-out keyword + spam protection)
    let optOutKeyword: string | null = null;
    let spamProtection = {
      enabled: true,
      blockOnHighRisk: true,
      maxHourlyMessages: 100,
      maxDailyMessages: 1000,
      maxMessagesPerMinute: 10,
      maxMessagesPerContact: 5,
      cooldownMinutes: 30,
      maxCampaignMessagesPerHour: 200,
      maxBulkRecipients: 500,
      enableWeekendLimits: false,
      weekendLimitPercent: 50
    };
    if (userId && supabaseAdmin) {
      const { data: userSettings } = await supabaseAdmin
        .from('user_settings')
        .select('opt_out_keyword, spam_protection')
        .eq('user_id', userId)
        .single();
      optOutKeyword = userSettings?.opt_out_keyword || 'STOP';
      if (userSettings?.spam_protection) {
        spamProtection = { ...spamProtection, ...userSettings.spam_protection };
      }
    }

    if (!optOutKeyword) {
      optOutKeyword = 'STOP';
    }

    // Content moderation (#123). One shared implementation with every other
    // send path now — this route and campaigns/run each carried their own copy,
    // and the three paths that carried neither are what prompted centralising it.
    //
    // `spamProtection` is still loaded above because the per-contact and
    // cooldown limits below read it; moderateWithPolicy takes the same object.
    //
    // No longer conditional on `userId && supabaseAdmin`. Scoring is pure and
    // local, so there was never a reason an anonymous send got to skip it.
    const moderation = moderateWithPolicy(spamProtection, message);
    if (!moderation.allowed) {
      return NextResponse.json({
        error: moderation.detail,
        spamRisk: true,
        spamScore: moderation.spamScore,
        detectedWords: moderation.flags,
        suggestions: moderation.suggestions
      }, { status: 400 });
    }

    if (spamProtection.enabled && userId && supabaseAdmin) {
      // Check rate limits
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const cooldownAgo = new Date(now.getTime() - (spamProtection.cooldownMinutes || 30) * 60 * 1000);

      // Calculate effective limits (apply weekend reduction if enabled)
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      const weekendMultiplier = (spamProtection.enableWeekendLimits && isWeekend)
        ? (spamProtection.weekendLimitPercent || 50) / 100
        : 1;

      const effectiveHourlyLimit = Math.round(spamProtection.maxHourlyMessages * weekendMultiplier);
      const effectiveDailyLimit = Math.round(spamProtection.maxDailyMessages * weekendMultiplier);
      const effectivePerMinuteLimit = Math.round((spamProtection.maxMessagesPerMinute || 10) * weekendMultiplier);

      // Count messages sent in last minute (burst protection)
      const { count: minuteCount } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .gte('created_at', oneMinuteAgo.toISOString());

      if ((minuteCount || 0) >= effectivePerMinuteLimit) {
        return NextResponse.json({
          error: `Rate limit exceeded: Maximum ${effectivePerMinuteLimit} messages per minute. Please wait a moment.`,
          rateLimited: true,
          limitType: 'per_minute'
        }, { status: 429 });
      }

      // Count messages sent in last hour
      const { count: hourlyCount } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .gte('created_at', oneHourAgo.toISOString());

      // Count messages sent in last 24 hours
      const { count: dailyCount } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .gte('created_at', oneDayAgo.toISOString());

      const currentHourly = hourlyCount || 0;
      const currentDaily = dailyCount || 0;

      // Check hourly limit
      if (currentHourly >= effectiveHourlyLimit) {
        return NextResponse.json({
          error: `Rate limit exceeded: You can send ${effectiveHourlyLimit} messages per hour${isWeekend && spamProtection.enableWeekendLimits ? ' (weekend limit)' : ''}. Currently sent: ${currentHourly}. Please wait.`,
          rateLimited: true,
          currentHourly,
          maxHourly: effectiveHourlyLimit
        }, { status: 429 });
      }

      // Check daily limit
      if (currentDaily >= effectiveDailyLimit) {
        return NextResponse.json({
          error: `Rate limit exceeded: You can send ${effectiveDailyLimit} messages per day${isWeekend && spamProtection.enableWeekendLimits ? ' (weekend limit)' : ''}. Currently sent: ${currentDaily}. Please wait until tomorrow.`,
          rateLimited: true,
          currentDaily,
          maxDaily: effectiveDailyLimit
        }, { status: 429 });
      }

      // The per-contact cap and cooldown that lived here are gone (#128).
      //
      // Both filtered on `.ilike('to_number', …)`. `to_number` is not a column
      // on public.messages — it is `to_phone` — so PostgREST returned 42703,
      // neither call checked `error`, and the undefined results made both
      // conditions unreachable. They had never blocked a message, on any
      // account, on any path.
      //
      // They now live in lib/smsGuard with the right column and checked errors,
      // which also means they apply on all eight send paths rather than only
      // this one.
    }

    // Opt-out footer on a first contact, through the shared helper.
    //
    // This was a hand-rolled copy — one of four, which is how the coverage came
    // to be misread as incomplete when it was not. The shared test also fixes a
    // real defect in this copy: it used `.single()` with no `.limit(1)`, and
    // `.single()` errors when more than one thread matches. The error was
    // discarded, so `existingCheck` came back null and a long-running
    // conversation was treated as a first contact. Harmless in direction — an
    // extra opt-out line — but wrong, and invisible.
    //
    // isFirstContact + appendOptOut rather than withOptOutFooterIfFirst, because
    // the keyword is already loaded above and the helper is split precisely so a
    // caller can reuse it instead of re-querying per message.
    const messageToSend =
      userId && supabaseAdmin && (await isFirstContact(supabaseAdmin, userId, to))
        ? appendOptOut(message, optOutKeyword)
        : message;

    // ── DNC, for EVERY caller including internal ones ─────────────────────────
    //
    // checkSmsAllowed() below is the full gate, but it sits inside
    // `if (!internalCaller)`, so a caller holding x-internal-secret skips it
    // entirely. Today all three internal callers — receptionist/respond,
    // process-drips, process-ai-drips — run the guard themselves, so nothing is
    // currently unprotected. But that makes the route's compliance depend on every
    // future internal caller remembering, and DNC is the one gate with statutory
    // consequences rather than commercial ones.
    //
    // Proven reachable, not theorised: the #17 harness POSTed here with
    // x-internal-secret for a number it had just opted out, and the request went
    // all the way to Telnyx — which rejected it only because the test number was
    // unroutable. Nothing in this route stopped it.
    //
    // This replaces an earlier hand-rolled check that read
    // `if (!dncError && dncCheck)` — skipping the block whenever the RPC errored,
    // i.e. failing OPEN on exactly the lookup that matters. This one fails closed.
    if (userId && supabaseAdmin) {
      const { data: dncRaw, error: dncError } = await supabaseAdmin.rpc('check_dnc', {
        p_user_id: userId,
        p_phone_number: to,
      });

      if (dncError) {
        console.error(`DNC check failed for ${to} (user ${userId}) — blocking send:`, dncError);
        return NextResponse.json(
          { error: 'Could not verify the do-not-contact list. Nothing was sent.', reason: 'check_failed', retryable: true },
          { status: 503 }
        );
      }

      const dnc = typeof dncRaw === 'string' ? JSON.parse(dncRaw) : dncRaw;
      if (dnc?.on_dnc_list) {
        console.log(`🚫 send-sms blocked — ${to} is on the ${dnc.on_user_list ? 'user' : 'global'} DNC list`);
        return NextResponse.json(
          { error: `Message blocked: ${to} is on the Do Not Contact list.`, onDncList: true, reason: dnc.reason },
          { status: 403 }
        );
      }
    }

    // Build request body
    // When we have a specific 'from' number, send it directly without messaging_profile_id.
    // Including messaging_profile_id with 'from' causes Telnyx to validate against the
    // number pool, which fails if Number Pool isn't enabled on the profile.
    // Only include messaging_profile_id when no 'from' is specified (auto-select mode).
    const requestBody: any = {
      to: to,
      text: messageToSend,
    };

    if (resolvedFrom) {
      requestBody.from = resolvedFrom;
    } else {
      requestBody.messaging_profile_id = messagingProfileId;
    }

    // Add media for MMS
    if (mediaUrls && mediaUrls.length > 0) {
      requestBody.media_urls = mediaUrls;
    }

    // Session callers pay, internal ones don't (#72).
    //
    // This route is the shared send primitive: the crons and receptionist call
    // it with x-internal-secret and have already charged credits and checked
    // quiet hours themselves. But it ALSO accepts a plain session, which
    // BulkComposeDrawer and SendSMSModal use — and that path charged nothing
    // and skipped quiet hours, so a user replaying their own app's request
    // could send unlimited free SMS at any hour.
    //
    // Removing the session path isn't an option: those two components are real
    // callers. So the session path gets the same treatment every other
    // user-facing send has.
    if (!internalCaller) {
      let recipientState: string | null = null;
      if (leadId && supabaseAdmin) {
        const { data: stateLead } = await supabaseAdmin
          .from('leads')
          .select('state')
          .eq('id', leadId)
          .eq('user_id', userId)      // scoped — see #64
          .maybeSingle();
        recipientState = stateLead?.state ?? null;
      }

      const guard = await checkSmsAllowed(supabaseAdmin!, userId, to, {
        enforceQuietHours: true,
        recipientState,
        context: { source: 'send-sms', lead_id: leadId ?? null },
      });

      if (!guard.allowed) {
        return NextResponse.json(
          { error: guard.detail || 'Message blocked', reason: guard.reason, retryable: !!guard.retryable },
          { status: guard.reason === 'quiet_hours' || guard.reason === 'rate_limited' ? 429 : 403 }
        );
      }

      // System courtesy replies cost nothing.
      //
      // after-hours and greeting messages are canned text with no model call, so
      // an automatic "we're closed" the account owner never wrote was showing up
      // on their statement as an SMS charge. Their call, 2026-08-04.
      //
      // Gated on internalCaller: a session caller could otherwise set this and
      // send unlimited free SMS. The balance check is skipped too — refusing a
      // free message for lack of credits would leave someone at zero unable to
      // send even an automated "we're closed", which is the moment it matters.
      const isFreeSystemMessage = internalCaller && !!freeSystemMessage;

      if (!isFreeSystemMessage) {
      const { data: creditRow } = await supabaseAdmin!
        .from('users')
        .select('credits')
        .eq('id', userId)
        .single();

      if (!creditRow || (creditRow.credits ?? 0) < 1) {
        return NextResponse.json(
          { error: 'Insufficient credits. Please purchase a credit pack to keep sending.' },
          { status: 402 }
        );
      }

      // Labelled by origin: an unattended auto-reply reads differently from a
      // message someone typed, and the after-hours case is exactly where
      // "why was I charged?" gets asked.
      const spendLabel = internalCaller && isAutomated
        ? `Automated SMS (${automationSource || 'receptionist'})`
        : 'SMS sent (1x)';

      // The ledger row is written by deduct_credits itself, in the same
      // transaction as the charge (#137) — passing `reason` is the whole of it.
      //
      // This route used to charge and then insert its own row. That is now a
      // double-count: the balance would move by 1 and the ledger would record 2,
      // so every "points used" figure would read double for the composer, bulk
      // send, the receptionist and both drip crons.
      const { error: deductError } = await supabaseAdmin!.rpc('deduct_credits', {
        user_id: userId,
        amount: 1,
        reason: spendLabel,
      });

      if (deductError) {
        // Fail closed: don't send if we couldn't charge for it.
        console.error(`send-sms: could not deduct credits for user ${userId} — refusing to send:`, deductError);
        return NextResponse.json({ error: 'Could not process credits' }, { status: 500 });
      }
      }
    }

    // Send via Telnyx API
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx API error:', data);
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || 'Failed to send message' },
        { status: response.status }
      );
    }

    console.log('✅ Telnyx SMS sent:', {
      to,
      from: data.data?.from?.phone_number,
      messageSid: data.data?.id,
    });

    // Save to database if we have user context
    if (supabaseAdmin && userId) {
      // #64: a client-supplied threadId must belong to this user. It used to be
      // trusted outright, so a message could be written into another tenant's
      // thread — and process-ai-drips reads thread messages as AI context, which
      // put attacker-controlled text into a victim's prompt. The userId above is
      // already guarded this way; threadId was missed.
      //
      // An unowned or unknown id falls through to find-or-create below rather
      // than erroring: the SMS has already been sent by this point, so the worst
      // outcome should be a new thread, not a lost record.
      let finalThreadId: string | null = null;

      if (threadId) {
        const { data: ownedThread } = await supabaseAdmin
          .from('threads')
          .select('id')
          .eq('id', threadId)
          .eq('user_id', userId)
          .maybeSingle();

        if (ownedThread) {
          finalThreadId = ownedThread.id;
        } else {
          console.error(`⚠️ send-sms: threadId ${threadId} is not owned by user ${userId} — ignoring it and resolving the thread normally`);
        }
      }

      // Create or get thread - check by phone number OR lead_id
      if (!finalThreadId) {
        let existingThread = null;

        // First try by phone number
        const { data: threadByPhone } = await supabaseAdmin
          .from('threads')
          .select('id, messages_from_user, lead_id, campaign_id')
          .eq('user_id', userId)
          .eq('phone_number', to)
          .single();

        if (threadByPhone) {
          existingThread = threadByPhone;
        } else if (leadId) {
          // Try by lead_id
          const { data: threadByLead } = await supabaseAdmin
            .from('threads')
            .select('id, messages_from_user, lead_id, campaign_id')
            .eq('user_id', userId)
            .eq('lead_id', leadId)
            .single();

          if (threadByLead) {
            existingThread = threadByLead;
            // Update phone_number on existing thread
            await supabaseAdmin
              .from('threads')
              .update({ phone_number: to })
              .eq('id', threadByLead.id);
          }
        }

        if (existingThread) {
          finalThreadId = existingThread.id;
          const updateData: any = {
            last_message: message,
            updated_at: new Date().toISOString(),
            messages_from_user: (existingThread.messages_from_user || 0) + 1,
          };
          // Set campaign_id if provided and thread doesn't have one yet
          if (campaignId && !existingThread.campaign_id) {
            updateData.campaign_id = campaignId;
          }
          await supabaseAdmin
            .from('threads')
            .update(updateData)
            .eq('id', finalThreadId);
        } else {
          const { data: newThread } = await supabaseAdmin
            .from('threads')
            .insert({
              user_id: userId,
              phone_number: to,
              lead_id: leadId || null,
              campaign_id: campaignId || null, // Set campaign_id for new threads
              channel: 'sms',
              status: 'active',
              last_message: message,
              messages_from_lead: 0,
              messages_from_user: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          finalThreadId = newThread?.id;
        }
      }

      // Save the message with spam score
      if (finalThreadId) {
        console.log('💾 Saving message to thread:', finalThreadId);
        // lead_id, resolved from the thread when the caller did not supply one.
        //
        // This insert simply omitted the column. Inbound messages and drip sends
        // carry lead_id; receptionist replies did not, so any query shaped
        // `WHERE lead_id = ?` returned the customer's messages with nothing
        // answering them — a conversation that reads as though the AI never
        // replied. 26 outbound rows were in that state, and I drew exactly that
        // false conclusion from one of them while investigating something else
        // (#150).
        //
        // The thread is the authority when `leadId` is absent: it is set when the
        // thread is created and is how the existing rows are recoverable at all.
        // A client conversation legitimately has no lead, so null stays valid.
        // Looked up here rather than reused from the thread-creation block above:
        // that block is skipped entirely when the caller passes a threadId, which
        // is exactly what the receptionist path does — so a variable from it would
        // miss the case this fix is for.
        let resolvedLeadIdForMessage: string | null = leadId || null;
        if (!resolvedLeadIdForMessage) {
          const { data: threadRow } = await supabaseAdmin
            .from('threads')
            .select('lead_id')
            .eq('id', finalThreadId)
            .maybeSingle();
          resolvedLeadIdForMessage = threadRow?.lead_id ?? null;
        }

        const { error: insertError } = await supabaseAdmin.from('messages').insert({
          user_id: userId, // Required for RLS
          thread_id: finalThreadId,
          lead_id: resolvedLeadIdForMessage,
          from_phone: data.data?.from?.phone_number || from,
          to_phone: to,
          body: message,
          content: message, // content column has NOT NULL constraint
          direction: 'outbound',
          status: 'sent',
          message_sid: data.data?.id,
          num_media: mediaUrls?.length || 0,
          media_urls: mediaUrls?.length > 0 ? mediaUrls : null,
          channel: mediaUrls?.length > 0 ? 'mms' : 'sms',
          provider: 'telnyx',
          spam_score: moderation.spamScore,
          spam_flags: moderation.flags,
          // Only a body-supplied flag from a verified internal caller counts. A
          // session caller is a human pressing send, whatever it claims.
          is_automated: internalCaller ? !!isAutomated : false,
          automation_source: internalCaller && isAutomated
            ? (automationSource || 'receptionist')
            : null,
          created_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('❌ Error saving message:', insertError);
        } else {
          console.log('✅ Message saved successfully');
        }
      } else {
        console.error('❌ No thread ID, message not saved');
      }
    } else {
      console.log('⚠️ No supabaseAdmin or userId, message not saved to DB');
    }

    return NextResponse.json({
      success: true,
      messageId: data.data?.id,
      from: data.data?.from?.phone_number,
      to: data.data?.to?.[0]?.phone_number,
      status: data.data?.to?.[0]?.status,
    });

  } catch (error: any) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}

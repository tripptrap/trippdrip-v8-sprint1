// API Route: Telnyx SMS Webhook
// This receives incoming SMS messages from Telnyx

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ContactType } from '@/lib/receptionist/types';
import { detectSpam } from '@/lib/spam/detector';
import { sendTelnyxSMS } from '@/lib/telnyx';
import { exemptFromModeration } from '@/lib/smsModeration';
import { consentFields } from '@/lib/leadConsent';
import { normalizePhone } from '@/lib/phone';
import { sendSmsAlertToUser } from '@/lib/sendSmsAlert';
import { cancelPendingDripMessages } from '@/lib/drip/materialize';
import { isAffirmative, isAwaitingConfirmation, markAwaitingConfirmation, confirmAndBookAppointment } from '@/lib/flows/completeFlow';
import { alertAdminsThrottled } from '@/lib/alerting';

// Opt-out keywords that trigger permanent DNC (STOP, UNSUBSCRIBE, etc.)
// LOW-5: "cancel" removed — it's too common in normal sentences ("cancel my appointment").
//        Appointment cancellations are handled separately by CANCEL_KEYWORDS below.
const OPT_OUT_KEYWORDS = [
  'stop', 'unsubscribe', 'quit', 'opt out', 'optout',
  'remove me', 'stop texting', 'don\'t text', 'dont text',
  'no more texts', 'leave me alone', 'take me off', 'end', 'halt'
];

// Standard HELP / START keywords. Required by MNOs and declared in every
// 10DLC campaign we register — see docs/10DLC_REJECTION_HISTORY.md (rejection
// #2 cited missing help-command and opt-in support). Exact whole-message
// matches only, so "help me pick a time" isn't treated as a HELP command.
const HELP_KEYWORDS = ['help', 'info'];
const OPT_IN_KEYWORDS = ['start', 'unstop', 'yes'];

function isHelpRequest(message: string): boolean {
  return HELP_KEYWORDS.includes(message.trim().toLowerCase());
}

function isOptIn(message: string): boolean {
  return OPT_IN_KEYWORDS.includes(message.trim().toLowerCase());
}

function isOptOut(message: string, customKeyword?: string | null): boolean {
  const lower = message.trim().toLowerCase();
  // Check user's custom opt-out keyword first (exact match)
  if (customKeyword && lower === customKeyword.toLowerCase()) return true;
  // Exact whole-message match
  if (OPT_OUT_KEYWORDS.includes(lower)) return true;
  // LOW-5: For multi-word phrases, require word-boundary match to avoid false positives
  // (e.g. "remove me" must appear as a phrase, not just "remove")
  return OPT_OUT_KEYWORDS.some(kw => {
    if (kw.length <= 4) return false; // handled by exact match above
    // Word-boundary check: phrase must not be part of a larger word
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i').test(lower);
  });
}

const CANCEL_KEYWORDS = ['cancel', 'cancel appointment', 'cancel my appointment', 'cant make it', "can't make it", 'no longer need'];
const RESCHEDULE_KEYWORDS = ['reschedule', 'move appointment', 'different time', 'change appointment', 'change time', 'new time'];

function isAppointmentCancel(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return CANCEL_KEYWORDS.some(kw => lower.includes(kw));
}

function isAppointmentReschedule(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return RESCHEDULE_KEYWORDS.some(kw => lower.includes(kw));
}

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

// Verify Telnyx webhook signature
function verifyTelnyxSignature(
  payload: string,
  signature: string,
  timestamp: string,
  publicKey: string
): boolean {
  try {
    const signedPayload = `${timestamp}|${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', publicKey)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Telnyx signature verification
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    const publicKey = process.env.TELNYX_PUBLIC_KEY;

    // Log for debugging (remove in production)
    console.log('📨 Telnyx webhook received:', {
      event_type: body?.data?.event_type,
      has_signature: !!signature,
      has_timestamp: !!timestamp,
    });

    // #67: refuse to run unverified in production. CRIT-3 closed the
    // "skipped in dev" hole by verifying whenever the key is set — but left the
    // case where the key is MISSING, which skipped both branches below and
    // processed every unsigned request as genuine.
    //
    // This is the most powerful unauthenticated surface in the app: a forged
    // request can create leads and messages, trigger billable AI replies, and
    // write a permanent DNC entry for a number that never opted out. The
    // number-order webhook already fails closed this way; this one didn't.
    if (!publicKey) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ TELNYX_PUBLIC_KEY not configured — refusing to process an unverified webhook in production');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      console.warn('⚠️ TELNYX_PUBLIC_KEY unset — accepting unsigned webhook (non-production only)');
    }

    // CRIT-3: Verify signature whenever TELNYX_PUBLIC_KEY is set — not just in production.
    // Skipping verification in dev/staging allows forged webhooks to be accepted.
    if (publicKey && (!signature || !timestamp)) {
      console.error('❌ Missing Telnyx webhook signature headers (TELNYX_PUBLIC_KEY is set, verification required)');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    if (publicKey && signature && timestamp) {
      // Ed25519 verification: validate using Telnyx public key
      try {
        const ed25519Sig = Buffer.from(signature, 'base64');
        const signedPayload = `${timestamp}|${rawBody}`;

        // Telnyx publishes its public key as **raw** base64 Ed25519 — 32 bytes.
        // This used to hand those 32 bytes to crypto.verify as
        // `format: 'der', type: 'spki'`, which they are not: SPKI-wrapped
        // Ed25519 is 44 bytes, the raw key behind a 12-byte ASN.1 header. Node
        // could not parse it and threw "Failed to read asymmetric key" (asn1
        // wrong tag), which the catch below turned into a 401.
        //
        // So **every inbound webhook was rejected** — no message stored, no
        // lead created, no opt-out honoured — from the day this check was
        // added. It failed closed and silently: nothing downstream ran, so even
        // the inbound-message-lost alert never fired (#110).
        const rawKey = Buffer.from(publicKey, 'base64');
        const spkiKey = rawKey.length === 32
          ? Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawKey])
          : rawKey; // already SPKI-wrapped
        const keyObject = crypto.createPublicKey({ key: spkiKey, format: 'der', type: 'spki' });

        const isValid = crypto.verify(
          null, // Ed25519 doesn't use a digest algorithm
          Buffer.from(signedPayload),
          keyObject,
          ed25519Sig
        );
        if (!isValid) {
          console.error('❌ Invalid Telnyx webhook signature');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } catch (verifyErr) {
        // CRIT-3: Reject on verification error whenever TELNYX_PUBLIC_KEY is configured
        console.error('❌ Webhook signature verification error:', verifyErr);
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }

    // Handle different Telnyx event types
    const eventType = body?.data?.event_type;
    const payload = body?.data?.payload;

    if (!payload) {
      console.log('No payload in webhook');
      return NextResponse.json({ received: true });
    }

    // Handle inbound SMS
    if (eventType === 'message.received') {
      await handleInboundSMS(payload);
    }

    // Handle delivery status updates
    if (eventType === 'message.sent' || eventType === 'message.delivered' || eventType === 'message.failed') {
      await handleDeliveryStatus(payload, eventType);
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Telnyx webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleInboundSMS(payload: any) {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured');
    return;
  }

  const from = payload.from?.phone_number;
  const to = payload.to?.[0]?.phone_number;
  const messageBody = payload.text;
  const messageSid = payload.id;
  const mediaUrls: string[] = [];

  // Handle MMS media
  if (payload.media && payload.media.length > 0) {
    for (const media of payload.media) {
      if (media.url) {
        mediaUrls.push(media.url);
      }
    }
  }

  console.log('📨 Incoming Telnyx SMS:', {
    from,
    to,
    body: messageBody,
    messageSid,
    mediaCount: mediaUrls.length,
  });

  // HIGH-6: Identify tenant by the RECEIVING number (to) first — this definitively
  // determines which user account the message belongs to. Starting with the sender's
  // phone or lead lookup can route to the wrong tenant if two tenants have the same lead.
  let userId: string | null = null;

  // One resolver, in the database, so the comparisons are normalised and the
  // ambiguous case is refused rather than guessed (#111).
  //
  // The three inline steps this replaces both compared phone strings exactly.
  // `leads.phone` holds whatever was imported while Telnyx always sends E.164,
  // so a lead stored as `(813) 465-8966` was invisible and the inbound was
  // silently dropped.
  //
  // The larger problem was the two sender-based steps existing at all in that
  // form. They also used `.single()`, which errors on multiple rows — which
  // accidentally avoided misattribution by dropping the message. Normalising
  // alone would have removed that accident and started delivering one business's
  // inbound to another's inbox. The resolver now returns `ambiguous` instead,
  // and adds the pool-number lookup, which was never consulted at all.
  const { data: resolved, error: resolveError } = await supabaseAdmin
    .rpc('resolve_inbound_tenant', { p_to: to, p_from: from });

  if (resolveError) {
    console.error('Tenant resolution failed for inbound message:', resolveError);
  }

  const match = Array.isArray(resolved) ? resolved[0] : resolved;
  userId = match?.user_id ?? null;

  if (userId) {
    console.log(`Found user via ${match.matched_by}:`, userId);
  }

  if (!userId) {
    // An unattributable inbound is a lead's reply that nobody will ever see, and
    // Telnyx does not redeliver. Previously this was a console line on a
    // serverless log nobody reads (#80 is the same failure).
    const why = match?.ambiguous
      ? `more than one account has ${from} as a contact, so there is no way to tell whose reply this is`
      : `${to} is not a number on any account, and ${from} matches no existing conversation or contact`;

    console.error('Could not find user for incoming message. From:', from, 'To:', to, '—', why);

    await alertAdminsThrottled({
      key: `inbound_unattributable:${match?.ambiguous ? 'ambiguous' : 'unknown'}`,
      title: 'An inbound message could not be matched to an account',
      body:
        `A message from ${from} to ${to} could not be attributed: ${why}. Telnyx does not ` +
        `redeliver, so this reply is lost and the account owner has no way to know someone ` +
        `replied.` +
        (match?.ambiguous
          ? ' It was NOT delivered to a guess, deliberately — that would put a consumer message in the wrong business inbox.'
          : ' Check whether the receiving number is still assigned in user_telnyx_numbers or number_pool.'),
      data: { from, to, matched_by: match?.matched_by ?? null, ambiguous: !!match?.ambiguous },
      windowMinutes: 60,
    }).catch(err => console.error('Unattributable-inbound alert failed:', err));

    return;
  }

  // Find — or create — the lead for this phone number (#95).
  //
  // This used to be lookup-only. Lead creation lived exclusively inside the
  // Receptionist handler, which returns early when a user has no
  // receptionist_settings row or has it disabled — true for 6 of 7 accounts. So
  // a first-time texter produced a thread and a message with lead_id null and
  // nothing else: absent from /leads, and ContactInfoPanel/SessionsPanel are
  // both gated on lead_id, so even "convert to client" was unreachable. The
  // contact could be read and replied to, and nothing more.
  //
  // Recording who contacted you is not the AI's job — whether the receptionist
  // replies is a separate decision from whether the person exists. So the
  // create happens here, before any of that.
  //
  // The lookup goes through find_lead_by_phone rather than `.eq('phone', from)`
  // because leads.phone holds whatever was imported, while Telnyx always sends
  // E.164. Two of 207 rows were stored as `4079513717` / `18708824134`; those
  // leads existed and were invisible to an exact match. Harmless while this was
  // lookup-only — it just left the thread unlinked — but with a create attached
  // it would mint a duplicate lead on every inbound from those contacts.
  let leadId: string | null = null;
  const { data: foundLeadId } = await supabaseAdmin
    .rpc('find_lead_by_phone', { p_user_id: userId, p_phone: from });

  if (foundLeadId) {
    leadId = foundLeadId as string;
  } else {
    // Honour an explicit opt-out, but default to creating: the column default is
    // true, and a user with no settings row has expressed no preference.
    const { data: recSettings } = await supabaseAdmin
      .from('receptionist_settings')
      .select('auto_create_leads')
      .eq('user_id', userId)
      .maybeSingle();

    if (recSettings?.auto_create_leads !== false) {
      // Columns verified against the live schema: leads has no `name`, and
      // leads_status_check permits only active/inactive/archived/deleted — the
      // Receptionist's copy of this insert used `name`/'new' and failed silently.
      const { data: newLead, error: newLeadError } = await supabaseAdmin
        .from('leads')
        .insert({
          user_id: userId,
          phone: from,
          first_name: 'New',
          last_name: 'Contact',
          source: 'inbound_sms',
          // They messaged the business first, which is the consent (#130). The
          // inbound message itself is the record, and it is stored.
          ...consentFields('inbound_message'),
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (newLeadError) {
        // Not fatal — the message must still be stored — but loud, because a
        // silent failure here is exactly what produced the original bug.
        console.error(`❌ Inbound: could not create a lead for ${from} (user ${userId}):`, newLeadError);
      } else if (newLead) {
        leadId = newLead.id;
        console.log(`📇 Inbound: created lead ${leadId} for ${from}`);
      }
    }
  }

  // Find or create thread for this conversation
  let threadId: string;

  const { data: threadData } = await supabaseAdmin
    .from('threads')
    .select('id, messages_from_lead')
    .eq('user_id', userId)
    .eq('phone_number', from)
    .eq('channel', 'sms')
    .single();

  if (threadData) {
    threadId = threadData.id;

    // Update thread
    await supabaseAdmin
      .from('threads')
      .update({
        last_message: messageBody,
        updated_at: new Date().toISOString(),
        messages_from_lead: (threadData.messages_from_lead || 0) + 1,
      })
      .eq('id', threadId);
  } else {
    // Create new thread
    const threadInsert: Record<string, any> = {
      user_id: userId,
      phone_number: from,
      channel: 'sms',
      status: 'active',
      last_message: messageBody,
      messages_from_lead: 1,
      messages_from_user: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (leadId) {
      threadInsert.lead_id = leadId;
    }
    const { data: newThread, error: threadError } = await supabaseAdmin
      .from('threads')
      .insert(threadInsert)
      .select('id')
      .single();

    if (threadError || !newThread) {
      console.error('Error creating thread:', threadError);
      return;
    }

    threadId = newThread.id;
  }

  // Deduplicate: check if this message was already processed (webhook retry)
  if (messageSid) {
    const { data: existingMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('message_sid', messageSid)
      .single();

    if (existingMsg) {
      console.log('⚠️ Duplicate webhook for message_sid:', messageSid, '— skipping');
      return;
    }
  }

  // Save the message
  console.log('💾 Saving inbound message:', { userId, threadId, from, to, messageBody: messageBody?.substring(0, 50) });

  // Fetch user's custom opt-out keyword
  let userOptOutKeyword: string | null = null;
  const { data: userSettings } = await supabaseAdmin
    .from('user_settings')
    .select('opt_out_keyword')
    .eq('user_id', userId)
    .single();
  userOptOutKeyword = userSettings?.opt_out_keyword || null;

  // Run spam detection on inbound message
  const spamResult = messageBody ? detectSpam(messageBody) : null;
  const optOut = messageBody ? isOptOut(messageBody, userOptOutKeyword) : false;

  // If opt-out, boost spam score and add flag
  const spamScore = optOut ? Math.max(spamResult?.spamScore || 0, 50) : (spamResult?.spamScore || 0);
  const spamFlags = [
    ...(spamResult?.detectedWords || []).map((w: any) => typeof w === 'string' ? w : w.word || String(w)),
    ...(optOut ? ['OPT_OUT_REQUEST'] : []),
  ];

  const messageData: Record<string, any> = {
    user_id: userId,
    thread_id: threadId,
    lead_id: leadId,
    from_phone: from,
    to_phone: to,
    body: messageBody,
    content: messageBody,
    direction: 'inbound',
    status: 'delivered',
    message_sid: messageSid,
    num_media: mediaUrls.length,
    media_urls: mediaUrls.length > 0 ? mediaUrls : null,
    channel: mediaUrls.length > 0 ? 'mms' : 'sms',
    provider: 'telnyx',
    spam_score: spamScore,
    spam_flags: spamFlags.length > 0 ? spamFlags : null,
    created_at: new Date().toISOString(),
  };

  const { data: insertedMsg, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert(messageData)
    .select();

  if (messageError) {
    // The lead's reply is gone. Telnyx has already accepted the webhook, so it
    // will not be redelivered, and the customer sees nothing in their inbox —
    // no error, just a lead who apparently never replied (#80).
    console.error('❌ Error saving inbound message:', messageError);
    console.error('❌ Message data was:', JSON.stringify(messageData));
    await alertAdminsThrottled({
      key: `inbound_message_lost:${userId}`,
      title: 'Inbound replies are being lost',
      body: `An inbound SMS from ${from} could not be saved (${messageError.message}). Telnyx does not redeliver, so the reply is unrecoverable and the account owner has no way to know a lead replied.`,
      data: { route: 'telnyx/sms-webhook', user_id: userId, from, error: messageError.message },
      windowMinutes: 30,
    });
  } else {
    console.log('✅ Telnyx inbound message saved:', insertedMsg);

    // Send SMS alert to user's personal phone (new inbound message)
    if (!optOut) {
      // By id, not by exact phone — same normalisation trap as everywhere else
      // in this handler (#95). Worst case here is only a missing name on the
      // alert, but there is no reason to keep the unreliable lookup.
      const { data: leadForAlert } = leadId
        ? await supabaseAdmin
            .from('leads')
            .select('first_name, last_name')
            .eq('user_id', userId)
            .eq('id', leadId)
            .single()
        : { data: null as { first_name: string | null; last_name: string | null } | null };
      const leadName = leadForAlert
        ? [leadForAlert.first_name, leadForAlert.last_name].filter(Boolean).join(' ')
        : undefined;
      sendSmsAlertToUser(userId, 'new_message', {
        leadName: leadName || undefined,
        leadPhone: from,
        message: messageBody,
      }).catch(err => console.error('SMS alert (new_message) failed:', err));
    }

    // Handle opt-out: add to DNC list, update lead, skip receptionist
    if (optOut) {
      console.log(`🚫 Opt-out detected from ${from}: "${messageBody}"`);

      try {
        // Use the add_to_dnc RPC rather than writing dnc_list/dnc_history directly.
        // check_dnc (what every send path gates on) matches on normalized_phone, so
        // an entry written without it is invisible to enforcement. The RPC owns
        // normalization, dedup, and dnc_history logging in one place.
        const { data: dncResult, error: dncAddError } = await supabaseAdmin
          .rpc('add_to_dnc', {
            p_user_id: userId,
            p_phone_number: from,
            p_reason: 'opt_out',
            p_source: 'inbound_sms',
            p_notes: `Lead texted: "${messageBody}"`,
          });

        // Record WHICH of our numbers took the STOP, so per-number opt-out
        // rates are possible (#122).
        //
        // Written here rather than passed into add_to_dnc because that would
        // mean changing the signature of a function this path depends on. And
        // it cannot be derived later: purge_lead_after_opt_out (#109) deletes
        // the lead's messages, so the inbound that carried the STOP is gone by
        // the time anyone looks. dnc_history survives the purge by design —
        // it is the evidence the opt-out happened.
        //
        // Best-effort: a failure here costs a statistic, never the suppression.
        if (!dncAddError && to) {
          const { error: attributionError } = await supabaseAdmin
            .from('dnc_history')
            .update({ received_on_number: to })
            .eq('user_id', userId)
            .eq('normalized_phone', (dncResult as any)?.normalized_phone ?? null)
            .is('received_on_number', null);
          if (attributionError) {
            console.error(`Could not attribute the opt-out from ${from} to ${to}:`, attributionError);
          }
        }

        if (dncAddError) {
          // Loud: a silent failure here means the lead keeps receiving messages
          // after texting STOP, which is a legal problem, not just a data problem.
          console.error(`❌ CRITICAL: failed to add ${from} to DNC list for user ${userId} after opt-out:`, dncAddError);
          // Keyed per number, not per route: the remedy is adding *this* number
          // to the DNC list by hand, so each affected person needs its own alert
          // (#80). The key still collapses webhook redeliveries of the same STOP.
          await alertAdminsThrottled({
            key: `dnc_write_failed:${userId}:${from}`,
            title: 'URGENT: a STOP was not recorded — the lead can still be messaged',
            body: `${from} texted STOP to user ${userId} and the add_to_dnc write failed (${dncAddError.message}). Enforcement reads the DNC list, so this number is still sendable. Add it manually before the next send.`,
            data: { route: 'telnyx/sms-webhook', user_id: userId, phone: from, error: dncAddError.message },
            windowMinutes: 1440,
            // Every message sent to this number from now on is a fresh
            // violation, so this cannot wait for someone to log in (#79).
            escalate: true,
          });
        } else {
          console.log(`✅ Added ${from} to DNC list for user ${userId} (${(dncResult as any)?.action ?? 'added'})`);
        }

        // Send SMS alert to user's personal phone (opt-out)
        sendSmsAlertToUser(userId, 'opt_out', {
          leadPhone: from,
        }).catch(err => console.error('SMS alert (opt_out) failed:', err));

        // Update lead's sms_opt_in to false. Targeted by the lead id resolved at
        // the top of this handler rather than by exact phone — see the
        // stop-on-reply block below for why `.eq('phone', from)` misses leads
        // whose number was imported in a non-E.164 format (#95).
        const { data: updatedLead } = leadId
          ? await supabaseAdmin
              .from('leads')
              .update({
                sms_opt_in: false,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('id', leadId)
              .select('id')
          : { data: null as { id: string }[] | null };

        // Cancel any queued drip messages. The DNC list already blocks these at
        // send time, but leaving them pending means the scheduled view keeps
        // showing messages that will never go out — and it relies on the DNC
        // check being the only thing standing between an opted-out lead and a
        // send. Removing them is both clearer and safer.
        if (updatedLead && updatedLead.length > 0) {
          const cancelled = await cancelPendingDripMessages(supabaseAdmin, {
            leadId: updatedLead[0].id,
            reason: 'Lead opted out',
          });
          if (cancelled > 0) {
            console.log(`Cancelled ${cancelled} queued drip message(s) for opted-out lead ${updatedLead[0].id}`);
          }
        }

        if (updatedLead && updatedLead.length > 0) {
          console.log(`✅ Set sms_opt_in=false for lead with phone ${from}`);
        }

        // Erase the person, keep the suppression (#109). Someone who opted out
        // wants nothing further from this business, so their name, email, notes
        // and conversation serve no purpose once they can never be contacted.
        //
        // Last in this branch on purpose: deleting the lead cascades the
        // messages, thread, follow-ups and drip enrollments that the code above
        // still refers to.
        //
        // The RPC refuses unless a dnc_list row already exists, so a failed
        // add_to_dnc above cannot result in an erased lead with nothing left to
        // stop the next import messaging them. `dncAddError` is checked here
        // too rather than relying on that alone — two guards, because the
        // failure mode is unrecoverable.
        if (!dncAddError) {
          const { data: purgeResult, error: purgeError } = await supabaseAdmin
            .rpc('purge_lead_after_opt_out', { p_user_id: userId, p_phone: from });
          if (purgeError) {
            console.error(`Opt-out purge failed for ${from} (they are still on the DNC list):`, purgeError);
          } else {
            console.log(`🧹 Opt-out purge for ${from}:`, purgeResult);
          }
        }
      } catch (dncErr) {
        console.error('Error handling opt-out DNC:', dncErr);
      }

      // Do NOT trigger receptionist for opt-out messages
      return;
    }

    // ── HELP: MNO-required standard keyword. Must always get a reply, even
    // for numbers on the DNC list (HELP is not marketing). ──────────────────
    if (messageBody && isHelpRequest(messageBody)) {
      console.log(`ℹ️ HELP request from ${from}`);
      try {
        const { data: bizRow } = await supabaseAdmin
          .from('users')
          .select('business_name, email')
          .eq('id', userId)
          .maybeSingle();

        const brand = bizRow?.business_name?.trim() || 'HyveWyre';
        const contact = bizRow?.email?.trim();
        await sendTelnyxSMS({
          to: from,
          from: to,
          message:
            `${brand}: For help, ${contact ? `contact ${contact}` : 'reply to this message'}. ` +
            `Reply STOP to unsubscribe. Msg&data rates may apply.`,
          // Carrier-mandated HELP text, identical for every account. Scoring it
          // could block the one reply we are legally required to send (#123).
          moderation: exemptFromModeration('system_message'),
        });
      } catch (helpErr) {
        console.error('Error sending HELP reply:', helpErr);
      }
      return;
    }

    // ── START/UNSTOP: re-subscribe a previously opted-out number ────────────
    if (messageBody && isOptIn(messageBody)) {
      console.log(`✅ Opt-in (re-subscribe) from ${from}`);
      try {
        // Matched on `normalized_phone`, not `phone_number` (#111).
        //
        // add_to_dnc stores the caller's string verbatim in `phone_number` and
        // the normalised form alongside it. An entry added by hand through
        // /api/dnc/add as `(813) 465-8966` therefore does not equal the E.164
        // `from` Telnyx sends — so this lookup missed, the START was not
        // recognised as a re-subscribe, and someone who explicitly asked to be
        // resubscribed stayed opted out. `normalized_phone` is the column that
        // exists for this comparison.
        const { data: dncRow } = await supabaseAdmin
          .from('dnc_list')
          .select('id')
          .eq('user_id', userId)
          .eq('normalized_phone', normalizePhone(from) ?? from)
          .maybeSingle();

        // Only treat this as a re-subscribe if they had actually opted out.
        // Otherwise "yes" is just a normal reply and belongs to the AI flow.
        if (!dncRow) {
          // fall through to normal handling below
        } else {
          await supabaseAdmin.from('dnc_list').delete().eq('id', dncRow.id);

          await supabaseAdmin.from('dnc_history').insert({
            user_id: userId,
            phone_number: from,
            action: 'removed',
            reason: 'opt_in',
            source: 'inbound_sms',
            notes: `Lead texted: "${messageBody}"`,
            created_at: new Date().toISOString(),
          });

          // By id, not exact phone (#95) — a missed match here would silently
          // leave sms_opt_in false for someone who just texted START.
          if (leadId) {
            await supabaseAdmin
              .from('leads')
              // They texted START, which is consent and is itself the record (#130).
              .update({ ...consentFields('inbound_message'), updated_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('id', leadId);
          }

          const { data: bizRow } = await supabaseAdmin
            .from('users')
            .select('business_name')
            .eq('id', userId)
            .maybeSingle();
          const brand = bizRow?.business_name?.trim() || 'HyveWyre';

          await sendTelnyxSMS({
            to: from,
            from: to,
            // Must name every message type the campaign declares. Telnyx
            // flagged this on campaign 4b30019f (2026-07-28): the START
            // auto-response didn't mention marketing/promotional messages even
            // though MARKETING is a selected sub-use-case. Keep in step with
            // buildConsentText() in lib/optInConsent.ts.
            message:
              `You are now opted in to receive SMS messages from ${brand}, ` +
              `including follow-ups, appointment reminders, account notifications, ` +
              `and promotional and marketing messages. ` +
              `Message frequency varies. Msg&data rates may apply. ` +
              `Consent is not a condition of purchase. Reply HELP for help, STOP to unsubscribe.`,
            // Required consent confirmation, and it names "promotional and
            // marketing messages" because the campaign declares them — wording
            // the detector would score against us (#123).
            moderation: exemptFromModeration('system_message'),
          });
          return;
        }
      } catch (optInErr) {
        console.error('Error handling opt-in:', optInErr);
      }
    }

    // Handle appointment cancel/reschedule via SMS (only if NOT an opt-out)
    if (messageBody && leadId && !optOut) {
      const wantsCancel = isAppointmentCancel(messageBody);
      const wantsReschedule = isAppointmentReschedule(messageBody);

      if (wantsCancel || wantsReschedule) {
        try {
          // Look up lead's next upcoming appointment
          const { data: upcomingAppt } = await supabaseAdmin
            .from('calendar_events')
            .select('id, google_event_id')
            .eq('lead_id', leadId)
            .gt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .single();

          if (upcomingAppt) {
            // Look up user's primary Telnyx number for the reply
            const { data: telnyxNum } = await supabaseAdmin
              .from('user_telnyx_numbers')
              .select('phone_number')
              .eq('user_id', userId)
              .eq('status', 'active')
              .order('is_primary', { ascending: false })
              .limit(1)
              .single();

            const replyFrom = telnyxNum?.phone_number || to;

            if (wantsCancel) {
              // Update calendar_event as cancelled
              await supabaseAdmin
                .from('calendar_events')
                .update({
                  cancellation_status: 'cancelled',
                  cancellation_reason: 'Cancelled via SMS',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', upcomingAppt.id);

              // MED-3: Try to delete from Google Calendar — refresh token if access token expired
              if (upcomingAppt.google_event_id) {
                try {
                  const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('google_calendar_access_token, google_calendar_refresh_token')
                    .eq('id', userId)
                    .single();

                  if (userData?.google_calendar_access_token && upcomingAppt.google_event_id) {
                    let accessToken = userData.google_calendar_access_token;

                    const gcalResponse = await fetch(
                      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${upcomingAppt.google_event_id}`,
                      { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
                    );

                    // Token expired — attempt refresh and retry once
                    if (gcalResponse.status === 401 && userData.google_calendar_refresh_token) {
                      try {
                        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                          body: new URLSearchParams({
                            client_id: process.env.GOOGLE_CLIENT_ID || '',
                            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                            refresh_token: userData.google_calendar_refresh_token,
                            grant_type: 'refresh_token',
                          }),
                        });
                        if (refreshRes.ok) {
                          const refreshData = await refreshRes.json();
                          accessToken = refreshData.access_token;
                          // Persist refreshed token
                          await supabaseAdmin.from('users').update({
                            google_calendar_access_token: accessToken,
                            updated_at: new Date().toISOString(),
                          }).eq('id', userId);
                          // Retry delete with new token
                          await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${upcomingAppt.google_event_id}`,
                            { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
                          );
                        }
                      } catch (refreshErr) {
                        console.error('Google Calendar token refresh failed:', refreshErr);
                      }
                    } else if (!gcalResponse.ok && gcalResponse.status !== 404) {
                      console.error('Failed to delete appointment from Google Calendar:', gcalResponse.status);
                    }
                  }
                } catch (gcalErr) {
                  console.error('Error deleting from Google Calendar:', gcalErr);
                }
              }

              // Update lead: appointment_scheduled = false
              await supabaseAdmin
                .from('leads')
                .update({
                  appointment_scheduled: false,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', leadId);

              // Send confirmation SMS
              await sendTelnyxSMS({
                to: from,
                from: replyFrom,
                message: "Your appointment has been cancelled. If you'd like to reschedule, just reply RESCHEDULE.",
                moderation: exemptFromModeration('system_message'),
              });

              // Log activity
              await supabaseAdmin
                .from('lead_activities')
                .insert({
                  user_id: userId,
                  lead_id: leadId,
                  activity_type: 'appointment_cancelled',
                  title: 'Appointment Cancelled',
                  description: 'Appointment cancelled via SMS',
                  metadata: { source: 'sms' },
                  created_at: new Date().toISOString(),
                });

              console.log(`Appointment cancelled via SMS for lead ${leadId}`);
            } else if (wantsReschedule) {
              // Update calendar_event as rescheduled
              await supabaseAdmin
                .from('calendar_events')
                .update({
                  cancellation_status: 'rescheduled',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', upcomingAppt.id);

              // Send SMS to prompt for new time
              await sendTelnyxSMS({
                to: from,
                from: replyFrom,
                message: "No problem! I'll help you find a new time. What day and time works better for you?",
                moderation: exemptFromModeration('system_message'),
              });

              console.log(`Appointment reschedule initiated via SMS for lead ${leadId}`);
              // Let the receptionist/flow AI take over from here
            }
          }
          // If no upcoming appointment found, fall through to normal handling
        } catch (apptErr) {
          console.error('Error handling appointment cancel/reschedule:', apptErr);
          // Don't block normal flow on error
        }
      }
    }

    // Stop-on-reply: pause any active drip campaign enrollments for this lead
    try {
      // Uses the lead already resolved at the top of this handler rather than
      // looking it up again by exact phone. `leads.phone` holds whatever was
      // imported while Telnyx always sends E.164, so `.eq('phone', from)` misses
      // any lead whose number was stored formatted — the same trap the lookup at
      // the top of this function documents (#95).
      //
      // It matters more here than anywhere else in this file, because this is
      // the one drip-stop path with nothing behind it. The opt-out path survives
      // a missed lookup: `purge_lead_after_opt_out` re-resolves the lead by
      // normalised phone and cascades the enrollments away. A reply that misses
      // here just leaves the drip running, so someone who answered keeps
      // receiving automated messages — and nothing reports it.
      if (leadId) {
        const { data: pausedEnrollments } = await supabaseAdmin
          .from('drip_campaign_enrollments')
          .update({ status: 'paused_reply', paused_at: new Date().toISOString() })
          .eq('lead_id', leadId)
          .eq('status', 'active')
          .select('id');

        if (pausedEnrollments && pausedEnrollments.length > 0) {
          console.log(`⏸️ Paused ${pausedEnrollments.length} drip enrollment(s) for lead ${leadId} due to reply`);

          // Drip steps are now materialised as real scheduled_messages rows, so
          // pausing the enrollment alone no longer stops anything — the queued
          // rows would still be picked up by process-scheduled. Cancel them.
          const cancelled = await cancelPendingDripMessages(supabaseAdmin, {
            leadId,
            reason: 'Lead replied — drip stopped',
          });
          if (cancelled > 0) {
            console.log(`⏸️ Cancelled ${cancelled} queued drip message(s) for lead ${leadId}`);
          }
        }
      }
    } catch (stopErr) {
      console.error('Error pausing drip enrollments on reply:', stopErr);
    }

    // Fire auto-tagging rules for message_received and lead_replied triggers
    if (leadId) {
      try {
        // message_received fires on every inbound message
        const { error: atErr1 } = await supabaseAdmin
          .rpc('execute_auto_tagging_rule', {
            p_user_id: userId,
            p_lead_id: leadId,
            p_trigger_type: 'message_received',
            p_trigger_data: { phone: from, message: messageBody },
          });
        if (atErr1) console.error('Auto-tag (message_received) error:', atErr1);

        // lead_replied fires on every inbound message (treat every reply as a "reply" event)
        const { error: atErr2 } = await supabaseAdmin
          .rpc('execute_auto_tagging_rule', {
            p_user_id: userId,
            p_lead_id: leadId,
            p_trigger_type: 'lead_replied',
            p_trigger_data: { phone: from, message: messageBody },
          });
        if (atErr2) console.error('Auto-tag (lead_replied) error:', atErr2);
      } catch (autoTagErr) {
        console.error('Error firing auto-tagging rules:', autoTagErr);
      }
    }

    // Check and trigger AI Receptionist if enabled
    await checkAndTriggerReceptionist(userId, threadId, from, to, messageBody);
  }
}

async function handleDeliveryStatus(payload: any, eventType: string) {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured');
    return;
  }

  const messageSid = payload.id;
  let status = 'sent';

  if (eventType === 'message.delivered') {
    status = 'delivered';
  } else if (eventType === 'message.failed') {
    status = 'failed';
  }

  console.log('📬 Telnyx delivery status:', { messageSid, status, eventType });

  // Update message status
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('message_sid', messageSid);

  if (error) {
    console.error('Error updating message status:', error);
  } else {
    console.log('✅ Message status updated to:', status);
  }
}

// Handle GET requests (for webhook verification)
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'Telnyx webhook endpoint active' });
}

/**
 * Check if receptionist should respond and trigger response
 */
async function checkAndTriggerReceptionist(
  userId: string,
  threadId: string,
  phoneNumber: string,
  toPhoneNumber: string,
  messageBody: string
) {
  if (!supabaseAdmin) return;

  try {
    // Get user's receptionist settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If no settings or not enabled, skip
    if (settingsError || !settings || !settings.enabled) {
      return;
    }

    // Check if user has taken over this conversation (ai_disabled flag)
    const { data: threadData } = await supabaseAdmin
      .from('threads')
      .select('ai_disabled')
      .eq('id', threadId)
      .single();

    if (threadData?.ai_disabled) {
      console.log('🤖 Receptionist: Skipping — user has taken over this conversation');
      return;
    }

    // Get lead info for this phone number
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, status, disposition')
      .eq('user_id', userId)
      .eq('phone', phoneNumber)
      .single();

    // Determine contact type
    let contactType: ContactType;
    let leadId: string | undefined;
    let leadName: string | undefined;
    let flowContext: import('@/lib/receptionist/types').FlowContext | null = null;

    if (lead) {
      leadId = lead.id;
      leadName = lead.name;

      // Sold/converted clients skip Flow AI entirely — Receptionist handles them
      const isSoldEarly = lead.disposition === 'sold' ||
                          lead.status === 'sold' ||
                          lead.disposition === 'closed_won';

      if (!isSoldEarly) {
      // Check if lead has a flow assigned — respect its autonomy mode
      // Also check campaign's auto_trigger_flow setting
      const { data: leadDetail } = await supabaseAdmin
        .from('leads')
        .select('flow_id, campaign_id')
        .eq('id', lead.id)
        .single();

      let effectiveFlowId = leadDetail?.flow_id;

      // If lead has no flow but their campaign has auto_trigger_flow enabled, assign it
      if (!effectiveFlowId && leadDetail?.campaign_id) {
        const { data: campaignData } = await supabaseAdmin
          .from('campaigns')
          .select('flow_id, auto_trigger_flow')
          .eq('id', leadDetail.campaign_id)
          .single();

        if (campaignData?.auto_trigger_flow && campaignData?.flow_id) {
          effectiveFlowId = campaignData.flow_id;
          // Assign the flow to this lead so future messages use it directly
          await supabaseAdmin
            .from('leads')
            .update({ flow_id: campaignData.flow_id })
            .eq('id', lead.id);
          console.log(`🤖 Auto-assigned campaign flow ${campaignData.flow_id} to lead ${lead.id}`);
        }
      }

      if (effectiveFlowId) {
        // Fetch flow name + context (autonomy + identity) — step content now lives on `tags`
        const { data: flowData } = await supabaseAdmin
          .from('conversation_flows')
          .select('name, context')
          .eq('id', effectiveFlowId)
          .single();

        const flowAutonomyMode = flowData?.context?.autonomyMode || 'full_auto';
        if (flowAutonomyMode === 'manual') {
          console.log('🤖 Receptionist: Skipping — assigned flow is in manual mode');
          return;
        }

        // ── Step-gated extraction & advancement (one tag/step at a time) ─────
        const { data: stepTagRows } = await supabaseAdmin
          .from('tags')
          .select('id, name, ai_instruction, field_name')
          .eq('flow_id', effectiveFlowId)
          .order('flow_step_order', { ascending: true });

        const steps = (stepTagRows || []).filter(t => !!t.field_name);

        if (steps.length > 0 && lead?.id) {
          // Load current collected info + tags from lead.conversation_state
          const { data: leadState } = await supabaseAdmin
            .from('leads')
            .select('conversation_state, tags, primary_tag')
            .eq('id', lead.id)
            .single();

          // #70: if the flow already finished and we asked the lead to confirm,
          // an affirmative reply books the appointment. This runs before step
          // extraction because there are no steps left to advance — without it
          // the AI just keeps re-offering and nothing is ever recorded.
          if (isAwaitingConfirmation(leadState?.conversation_state as any)) {
            if (messageBody && isAffirmative(messageBody)) {
              const { data: fullLead } = await supabaseAdmin
                .from('leads')
                .select('id, first_name, last_name, phone, email, tags, conversation_state, campaign_id')
                .eq('id', lead.id)
                .single();

              if (fullLead) {
                const collected = (fullLead.conversation_state as any)?.collectedInfo || {};
                const result = await confirmAndBookAppointment({
                  supabase: supabaseAdmin,
                  userId,
                  lead: fullLead as any,
                  flowId: effectiveFlowId,
                  campaignId: fullLead.campaign_id ?? null,
                  stepsCompleted: Object.keys(collected).length,
                  totalSteps: steps.length,
                });

                if (result.booked) {
                  sendSmsAlertToUser(userId, 'appointment', {
                    leadPhone: phoneNumber,
                    leadName: [fullLead.first_name, fullLead.last_name].filter(Boolean).join(' ') || undefined,
                  }).catch(err => console.error('SMS alert (appointment) failed:', err));
                }
              }
            }
            // Either way the AI still replies below — confirming the booking, or
            // handling a "no"/"can we do Tuesday" as a reschedule request.
          }

          const currentCollected: Record<string, string> =
            (leadState?.conversation_state as any)?.collectedInfo || {};

          // Current step = first step (in order) whose field isn't collected yet
          const current = steps.find(s => !currentCollected[s.field_name]) || null;

          // Extract an answer for ONLY the current step's field — deliberately one
          // step at a time for the baseline (multi-step jump-ahead is issue #27)
          let newlyExtracted: Record<string, string> = {};
          if (current) {
            try {
              const { extractFlowAnswers } = await import('@/lib/ai/extractFlowAnswers');
              newlyExtracted = await extractFlowAnswers(
                messageBody,
                [{ question: current.ai_instruction || current.name, fieldName: current.field_name }],
                currentCollected
              );
            } catch (extractErr) {
              console.error('🤖 Answer extraction failed (non-fatal):', extractErr);
            }
          }

          const updatedCollected = { ...currentCollected, ...newlyExtracted };
          const justCompletedStep = current && newlyExtracted[current.field_name] ? current : null;

          if (justCompletedStep) {
            const existingTags: string[] = leadState?.tags || [];
            const newTags = existingTags.includes(justCompletedStep.name)
              ? existingTags
              : [...existingTags, justCompletedStep.name];

            await supabaseAdmin
              .from('leads')
              .update({
                conversation_state: {
                  ...(leadState?.conversation_state as any || {}),
                  collectedInfo: updatedCollected,
                  lastUpdated: new Date().toISOString(),
                },
                tags: newTags,
                primary_tag: justCompletedStep.name,
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);

            console.log(`🤖 Flow step complete — advanced to tag "${justCompletedStep.name}"`, newlyExtracted);
          }

          // Recompute current step now that this turn's answer (if any) is merged in
          const newCurrent = steps.find(s => !updatedCollected[s.field_name]) || null;
          const allAnswered = newCurrent === null;

          // #70: everything is collected — move into the confirm-then-book
          // stage so the next affirmative reply actually creates the
          // appointment. Idempotent, so re-running on later turns is harmless.
          if (allAnswered) {
            await markAwaitingConfirmation({
              supabase: supabaseAdmin,
              leadId: lead.id,
              conversationState: { ...(leadState?.conversation_state as any || {}), collectedInfo: updatedCollected },
            });
          }

          const toFlowStep = (s: typeof steps[number], completed: boolean) => ({
            tagId: s.id,
            tagName: s.name,
            aiInstruction: s.ai_instruction || s.name,
            fieldName: s.field_name,
            completed,
          });

          // Build flowContext to pass to the AI — full step list for continuity/tone,
          // plus which single step is live right now
          flowContext = {
            flowName: flowData?.name || 'Qualification Flow',
            steps: steps.map(s => toFlowStep(s, !!updatedCollected[s.field_name])),
            collectedInfo: updatedCollected,
            currentStep: newCurrent ? toFlowStep(newCurrent, false) : null,
            allAnswered,
          };
        }

        // 'suggest' mode: generate draft and store on thread, notify user — don't auto-send
        if (flowAutonomyMode === 'suggest') {
          console.log('🤖 Receptionist: Suggest mode — generating draft for user review');
          try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            await fetch(`${baseUrl}/api/receptionist/respond`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': process.env.CRON_SECRET || '',
              },
              body: JSON.stringify({
                userId,
                threadId,
                phoneNumber,
                toPhoneNumber,
                inboundMessage: messageBody,
                contactType: 'existing_lead',
                leadId: lead?.id,
                leadName: (lead as any)?.first_name || lead?.name || 'Lead',
                draftOnly: true,
                flowContext,
              }),
            });
          } catch (err) {
            console.error('🤖 Suggest mode draft generation failed:', err);
          }
          return;
        }
        // 'full_auto': proceed normally (flowContext will be passed to receptionist below)
      }
      } // end !isSoldEarly — flow block

      // Check if this is a sold client
      const isSoldClient = lead.disposition === 'sold' ||
                           lead.status === 'sold' ||
                           lead.disposition === 'closed_won';

      if (isSoldClient) {
        contactType = 'sold_client';
        if (!settings.respond_to_sold_clients) {
          console.log('🤖 Receptionist: Skipping sold client (disabled in settings)');
          return;
        }
      } else {
        contactType = 'existing_lead';
        // For existing leads that aren't sold, only respond if they're configured to receive responses
        // For now, treat existing leads like new contacts
        if (!settings.respond_to_new_contacts) {
          console.log('🤖 Receptionist: Skipping existing lead (new contacts disabled)');
          return;
        }
      }
    } else {
      // New contact - no existing lead
      contactType = 'new_contact';

      if (!settings.respond_to_new_contacts) {
        console.log('🤖 Receptionist: Skipping new contact (disabled in settings)');
        return;
      }

      // Auto-create lead if enabled
      if (settings.auto_create_leads) {
        // NOTE: leads has no `name` column, and leads_status_check permits only
        // active/inactive/archived/deleted — using `name`/'new' here silently
        // failed, so inbound contacts were never converted into leads.
        const { data: newLead, error: leadError } = await supabaseAdmin
          .from('leads')
          .insert({
            user_id: userId,
            phone: phoneNumber,
            first_name: 'New',
            last_name: 'Contact',
            source: 'inbound_sms',
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id, first_name, last_name')
          .single();

        if (leadError) {
          console.error('🤖 Receptionist: Auto-create lead failed:', leadError);
        }

        if (newLead && !leadError) {
          leadId = newLead.id;
          leadName = [newLead.first_name, newLead.last_name].filter(Boolean).join(' ') || 'New Contact';
          console.log('🤖 Receptionist: Auto-created new lead:', leadId);

          // Link the thread to the new lead
          await supabaseAdmin
            .from('threads')
            .update({ lead_id: leadId })
            .eq('id', threadId);
        }
      }
    }

    console.log('🤖 Receptionist: Triggering response', {
      userId,
      threadId,
      phoneNumber,
      contactType,
      leadId,
    });

    // Call the receptionist respond API — pass flowContext so AI knows what to ask next
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/receptionist/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        threadId,
        phoneNumber,
        toPhoneNumber,
        inboundMessage: messageBody,
        contactType,
        leadId,
        leadName,
        flowContext: flowContext || null,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Receptionist response sent:', {
        responseType: result.responseType,
        pointsUsed: result.pointsUsed,
      });
    } else {
      console.log('⚠️ Receptionist response not sent:', result.error);
    }
  } catch (error) {
    console.error('❌ Receptionist trigger error:', error);
    // Don't throw - we don't want to fail the webhook if receptionist fails
  }
}

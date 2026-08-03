// Content moderation for outbound SMS (#123).
//
// ── Why this is separate from smsGuard ──────────────────────────────────────
//
// `checkSmsAllowed` answers "may this account message this person" — DNC,
// suspension, quiet hours, rate caps. All of that is knowable before a single
// word is written, which is why several paths call it *before* composing the
// message (the AI drip cron deliberately does, so a blocked send never pays for
// an OpenAI call).
//
// Content moderation asks a different question — "is this particular text safe
// to put on the wire" — and it cannot run until the text exists. Folding it
// into the guard would force every path to compose first and check second,
// which is exactly the ordering the guard was written to avoid.
//
// ── Why sendTelnyxSMS requires a decision ───────────────────────────────────
//
// Before this, spam scoring blocked in `telnyx/send-sms` and `campaigns/run`
// and nowhere else. Three paths carrying user-authored text — `sms/send`, the
// scheduled cron, and bulk scheduling — called `sendTelnyxSMS` directly and
// scored nothing.
//
// That is the third time a send-path control has covered only those same two
// routes: rate limits (#121) and from-number resolution (#122) both shipped
// with the identical hole, and both were found by audit rather than by anything
// failing. Centralising the logic is what fixed those, but centralising alone
// does not stop a *new* path from forgetting to call it.
//
// So `SendTelnyxSMSOptions.moderation` is a **required** field. Every outbound
// message goes through that one function, and the field cannot be omitted
// without a type error — a new send path has to state what it decided. Bypasses
// are still possible but must be written down (`exemptFromModeration`), which
// makes them greppable instead of accidental.

import type { SupabaseClient } from '@supabase/supabase-js';
import { detectSpam } from './spam/detector';

/**
 * Messages that are deliberately not scored.
 *
 * Both of these would be *harmed* by moderation rather than helped:
 *
 *   system_message  Our own fixed compliance text — the HELP reply, the START
 *                   confirmation, appointment confirmations. The wording is
 *                   carrier-mandated and identical for everyone. Blocking a
 *                   HELP reply because it says "reply STOP to unsubscribe" is
 *                   itself the compliance failure.
 *   account_alert   Notifications to the account owner's own phone. Not
 *                   marketing, not sent to a lead, and already exempt from DNC
 *                   for the same reason (see lib/smsGuard header).
 */
export type Exemption = 'system_message' | 'account_alert';

export interface ModerationDecision {
  /** False means do not send. */
  allowed: boolean;
  /** 0–100, or null when the message was exempt and never scored. */
  spamScore: number | null;
  /** Matched words, for `messages.spam_flags`. */
  flags: string[];
  /** Suggested rewrites, worth returning to a human composing a message. */
  suggestions: string[];
  /** Human-readable, safe to show the sender. */
  detail?: string;
  /** Set when scoring was skipped, and why. */
  exemption?: Exemption;
}

/**
 * Declare a message exempt from scoring.
 *
 * Deliberately verbose at the call site. An exemption is a decision to send
 * something unchecked, and it should read like one.
 */
export function exemptFromModeration(exemption: Exemption): ModerationDecision {
  return { allowed: true, spamScore: null, flags: [], suggestions: [], exemption };
}

/** The account's moderation policy. Mirrors the settings UI defaults. */
export interface ModerationPolicy {
  enabled: boolean;
  blockOnHighRisk: boolean;
}

const DEFAULT_POLICY: ModerationPolicy = { enabled: true, blockOnHighRisk: true };

/**
 * Read the account's policy.
 *
 * Falls back to the defaults on any read failure. That is fail-closed at no
 * availability cost — scoring itself is pure and local, so a database problem
 * degrades to "score, and block high risk" rather than to "send anything".
 *
 * Exported separately from `moderateOutbound` so a bulk sender can read the
 * policy once and score N personalized messages against it. A campaign of 500
 * leads should not make 500 identical settings queries.
 */
export async function loadModerationPolicy(
  supabase: SupabaseClient,
  userId: string
): Promise<ModerationPolicy> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('spam_protection')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`Spam-protection settings unreadable for ${userId} — using defaults:`, error);
      return DEFAULT_POLICY;
    }
    return data?.spam_protection ? { ...DEFAULT_POLICY, ...data.spam_protection } : DEFAULT_POLICY;
  } catch (e) {
    console.error(`Spam-protection settings threw for ${userId} — using defaults:`, e);
    return DEFAULT_POLICY;
  }
}

/**
 * Score one message against an already-loaded policy.
 *
 * `enabled: false` skips scoring entirely — the account's choice.
 * `blockOnHighRisk: false` scores without blocking: the score is still returned
 * and still recorded on the message row, so number health has data even for
 * accounts that decline the block.
 */
export function moderateWithPolicy(policy: ModerationPolicy, message: string): ModerationDecision {
  if (!message) {
    return { allowed: false, spamScore: null, flags: [], suggestions: [], detail: 'Empty message' };
  }

  if (!policy.enabled) {
    return { allowed: true, spamScore: null, flags: [], suggestions: [] };
  }

  const result = detectSpam(message);
  const flags = result.detectedWords.map(w => w.word);

  if (policy.blockOnHighRisk && result.isSpammy) {
    return {
      allowed: false,
      spamScore: result.spamScore,
      flags,
      suggestions: result.suggestions,
      detail:
        `Message blocked: high spam risk (score ${result.spamScore}/100). ` +
        `Flagged: ${flags.slice(0, 5).join(', ')}. Revise the wording and try again.`,
    };
  }

  return { allowed: true, spamScore: result.spamScore, flags, suggestions: result.suggestions };
}

/** Load the policy and score one message. The common case — one send, one decision. */
export async function moderateOutbound(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<ModerationDecision> {
  return moderateWithPolicy(await loadModerationPolicy(supabase, userId), message);
}

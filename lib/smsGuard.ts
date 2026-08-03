// Single gate every lead-facing SMS send must pass through.
//
// Why this exists: the DNC check used to be copy-pasted into each send route,
// and three routes (appointment reminders, scheduled sends, bulk scheduled
// sends) simply never got it — so a lead who texted STOP kept receiving
// messages depending on which feature happened to send them (#40). Centralising
// it means a new send path gets the check by using the helper, rather than by
// remembering to reimplement it.
//
// This also makes `leads.sms_opt_in` actually count (#37). It was written on
// opt-out but read by nothing, so it looked like a safety net while providing
// none.
//
// NOTE: only for messages to leads/clients. Alerts to the account owner's own
// phone (lib/sendSmsAlert.ts, /api/notifications/sms-alert) are not marketing
// and must not be gated on the recipient's DNC status.

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkQuietHours } from './quietHours';
import { getAccountRisk, applyRiskFactor } from './riskTier';

export interface SmsGuardResult {
  allowed: boolean;
  /** Machine-readable reason when blocked. */
  reason?: 'dnc' | 'opted_out' | 'quiet_hours' | 'check_failed' | 'account_blocked' | 'rate_limited';
  /** Human-readable detail, safe to log. */
  detail?: string;
  /**
   * True when the block is temporary and the caller should try again later
   * rather than cancelling. Only quiet_hours is retryable — DNC and opt-out
   * are permanent.
   */
  retryable?: boolean;
  /** Present when blocked by DNC. */
  listType?: 'user' | 'global';
  normalizedPhone?: string;
}

interface GuardOptions {
  /** Recorded in dnc_history.metadata when a send is blocked, for audit. */
  context?: Record<string, unknown>;
  /** Set false to skip writing a dnc_history 'blocked' row. Default true. */
  logBlocked?: boolean;
  /**
   * Also enforce quiet hours (#50). Off by default so a user pressing "send"
   * on a single message isn't blocked by their own sending window — that's a
   * deliberate human action. Automated paths (crons, campaigns, drips) should
   * pass true.
   */
  enforceQuietHours?: boolean;
  /**
   * Recipient's state code, used to gate on *their* local time rather than the
   * sender's — which is what TCPA actually requires. Falls back to the sender's
   * timezone when absent or unrecognised.
   */
  recipientState?: string | null;
}

/** Defaults mirror app/api/telnyx/send-sms — the only place these existed before (#121). */
const DEFAULT_LIMITS = {
  maxMessagesPerMinute: 10,
  maxHourlyMessages: 100,
  maxDailyMessages: 1000,
  enableWeekendLimits: false,
  weekendLimitPercent: 50,
  // Defaults carried over from the send-sms block these replaced (#128).
  maxMessagesPerContact: 5,
  cooldownMinutes: 30,
};

/**
 * Per-account send rate. Returns a blocking result, or null when under the cap.
 *
 * One RPC rather than three COUNT queries — the guard runs per message, and a
 * 100-message bulk loop would otherwise fire 300 round trips.
 */
async function checkSendRate(
  supabase: SupabaseClient,
  userId: string,
  out?: { limits?: typeof DEFAULT_LIMITS }
): Promise<SmsGuardResult | null> {
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('spam_protection')
    .eq('user_id', userId)
    .maybeSingle();

  const limits = { ...DEFAULT_LIMITS, ...(settingsRow?.spam_protection || {}) };
  // Handed back so the per-contact check below reuses them rather than making a
  // second identical settings query on every send.
  if (out) out.limits = limits;

  const isWeekend = [0, 6].includes(new Date().getDay());
  const multiplier = limits.enableWeekendLimits && isWeekend
    ? (limits.weekendLimitPercent || 50) / 100
    : 1;

  // Risk tier (#123 gap 4). The account's configured caps are the ceiling; this
  // reduces them while its opt-out rate is elevated and restores them as the
  // rolling window clears — automatic in both directions, so a throttle never
  // needs a human to lift it.
  //
  // Applied through applyRiskFactor, which floors at 1: `cap === 0` means "zero
  // allowed" to the loop below, so a small cap rounding down to 0 would turn a
  // throttle into a total block nobody authorised.
  const risk = await getAccountRisk(supabase, userId);

  const { data, error } = await supabase.rpc('get_send_counts', { p_user_id: userId });
  if (error) {
    // Deliberately does NOT block. A rate check that cannot run is not evidence
    // of abuse, and failing closed here would stop every send on a transient
    // error — the opposite of the containment this is for. The account-status
    // gate above is the one that fails closed.
    console.error(`Send-rate lookup failed for user ${userId} — allowing send:`, error);
    return null;
  }

  const counts = Array.isArray(data) ? data[0] : data;
  // Named to avoid shadowing the `cap` destructured in the loop below.
  const effectiveCap = (configured: number) =>
    applyRiskFactor(Math.round(configured * multiplier), risk.factor);
  const windows: [string, number, number][] = [
    ['minute', counts?.last_minute ?? 0, effectiveCap(limits.maxMessagesPerMinute)],
    ['hour', counts?.last_hour ?? 0, effectiveCap(limits.maxHourlyMessages)],
    ['day', counts?.last_day ?? 0, effectiveCap(limits.maxDailyMessages)],
  ];

  for (const [window, sent, cap] of windows) {
    // `cap === 0` means zero allowed, not unlimited. Guarding with `cap > 0`
    // made setting a limit to zero — the obvious way to stop one account
    // sending — silently permit everything. Missing keys get DEFAULT_LIMITS
    // above, so a 0 here is always deliberate.
    if (cap >= 0 && sent >= cap) {
      const qualifiers = [
        multiplier !== 1 ? 'weekend limit' : '',
        risk.factor !== 1 ? `reduced — ${risk.reason}` : '',
      ].filter(Boolean);
      const detail =
        `Send rate exceeded: ${sent}/${cap} messages this ${window}` +
        (qualifiers.length ? ` (${qualifiers.join('; ')})` : '');
      console.log(`🛑 Rate limited: user ${userId} — ${detail}`);
      return { allowed: false, reason: 'rate_limited', retryable: true, detail };
    }
  }

  return null;
}

/**
 * Per-contact daily cap and cooldown (#128).
 *
 * ── Both of these had never blocked a single message ────────────────────────
 *
 * They existed only in `telnyx/send-sms`, and both filtered on
 * `.ilike('to_number', …)`. **`to_number` is not a column on public.messages** —
 * the live column is `to_phone`. PostgREST returns 42703, and neither call
 * checked `error`:
 *
 *     const { count } = await …ilike('to_number', …)   // count is undefined
 *     if ((count || 0) >= maxPerContact)               // 0 >= 5, never true
 *
 *     const { data: lastMessage } = await …            // null on error
 *     if (lastMessage) { … }                           // never entered
 *
 * So Settings offered two limits, the user could set them, and they did
 * nothing — for every account, on every path. Verified against the linked
 * database: `SELECT … WHERE to_number IS NOT NULL` → `column "to_number" does
 * not exist`.
 *
 * Moved here because both are per-message and per-recipient, which is exactly
 * what this guard already receives, and because it runs on all eight send paths
 * rather than the one they used to live on.
 *
 * Matching is on the same candidate set the opt-in check below uses rather than
 * a leading-wildcard `ilike`: `to_phone` is stored E.164, and `%1234567890%`
 * cannot use an index no matter what is created.
 */
async function checkContactLimits(
  supabase: SupabaseClient,
  userId: string,
  candidates: string[],
  limits: { maxMessagesPerContact: number; cooldownMinutes: number }
): Promise<SmsGuardResult | null> {
  if (!candidates.length) return null;

  // Daily cap for this contact.
  if (limits.maxMessagesPerContact >= 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .in('to_phone', candidates)
      .gte('created_at', since);

    if (error) {
      // Fails OPEN and says so, matching checkSendRate: a contact-frequency
      // check that cannot run is not evidence of abuse. Logging is the point —
      // silence here is what hid the missing column for as long as it did.
      console.error(`Per-contact count failed for user ${userId} — allowing send:`, error);
    } else if ((count ?? 0) >= limits.maxMessagesPerContact) {
      return {
        allowed: false,
        reason: 'rate_limited',
        retryable: true,
        detail:
          `Contact limit reached: ${count} of ${limits.maxMessagesPerContact} messages ` +
          `to this contact in the last 24 hours`,
      };
    }
  }

  // Minimum gap since the last message to this contact.
  if (limits.cooldownMinutes > 0) {
    const { data: last, error } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .in('to_phone', candidates)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`Cooldown lookup failed for user ${userId} — allowing send:`, error);
    } else if (last?.created_at) {
      const minutesSince = (Date.now() - Date.parse(last.created_at)) / 60000;
      if (minutesSince < limits.cooldownMinutes) {
        const wait = Math.ceil(limits.cooldownMinutes - minutesSince);
        return {
          allowed: false,
          reason: 'rate_limited',
          retryable: true,
          detail: `Cooldown active: ${wait} more minute${wait === 1 ? '' : 's'} before messaging this contact again`,
        };
      }
    }
  }

  return null;
}

/**
 * Returns whether an SMS to `phone` is permitted for `userId`.
 *
 * Fails CLOSED: if the DNC check itself errors, the send is blocked. Sending to
 * a possibly-opted-out number is a legal problem; not sending during a
 * transient database error is an availability problem. The legal one is worse.
 */
export async function checkSmsAllowed(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  options: GuardOptions = {}
): Promise<SmsGuardResult> {
  const { context, logBlocked = true, enforceQuietHours = false, recipientState } = options;

  if (!phone) {
    return { allowed: false, reason: 'check_failed', detail: 'No phone number provided' };
  }

  // 0. Is this account allowed to send at all? (#121)
  //
  // `account_status` and `suspended_until` existed and were checked when buying
  // or porting a number — but **not on any send path**. So suspending someone
  // stopped them acquiring numbers and did nothing about the messages they were
  // already sending, which is the thing suspension is for.
  //
  // Only these two columns: `banned_until` is on **auth.users**, not
  // public.users. Selecting it here errored with 42703, and because this gate
  // fails closed that would have blocked every send in the product. Querying
  // `information_schema.columns` without `table_schema = 'public'` matches both
  // tables and is what produced the wrong column list.
  //
  // Not retryable: a scheduled message from a suspended account should fail
  // visibly rather than sit in the queue quietly draining once the suspension
  // lifts. The operator suspended them for a reason.
  const { data: account, error: accountError } = await supabase
    .from('users')
    .select('account_status, suspended_until')
    .eq('id', userId)
    .single();

  if (accountError) {
    // Fail closed. Unlike quiet hours, "cannot tell whether this account is
    // banned" is not a reason to send — this gate exists to contain damage.
    console.error(`Account-status lookup failed for user ${userId} — blocking send:`, accountError);
    return { allowed: false, reason: 'check_failed', detail: accountError.message };
  }

  const nowMs = Date.now();
  const suspendedUntil = account?.suspended_until ? Date.parse(account.suspended_until) : null;
  // Values come from the users_account_status_check constraint:
  // active | suspended | trial | cancelled. 'trialing' is not one of them — a
  // guess at that name would have blocked every trial user from sending.
  const SENDING_STATUSES = ['active', 'trial'];
  const statusBlocks = account?.account_status && !SENDING_STATUSES.includes(account.account_status);

  if (statusBlocks || (suspendedUntil && suspendedUntil > nowMs)) {
    const detail = statusBlocks
      ? `Account status is "${account!.account_status}"`
      : `Account is suspended until ${account!.suspended_until}`;
    console.log(`🚫 Blocked: send for user ${userId} — ${detail}`);
    return { allowed: false, reason: 'account_blocked', retryable: false, detail };
  }

  // 0b. Per-account send rate (#121).
  //
  // These limits lived in `telnyx/send-sms` and `campaigns/run` only — absent
  // from sms/send, all three crons and messages/schedule/bulk, which are
  // precisely the high-volume paths. One agent could not blast by hand but
  // could schedule or drip without any cap, and on shared numbers that burns
  // everyone's deliverability (#120, #121).
  //
  // Retryable on purpose: hitting the cap should defer a scheduled message to
  // the next run, not mark it failed. Only the caller knows whether it has a
  // "later" — the crons do, a human pressing send does not.
  const rateOut: { limits?: typeof DEFAULT_LIMITS } = {};
  const rate = await checkSendRate(supabase, userId, rateOut);
  if (rate) return rate;

  // Quiet hours first — it's the cheapest check and, unlike DNC, a block here
  // is temporary, so there's no point writing a dnc_history row for it.
  if (enforceQuietHours) {
    const { data: settings, error: settingsError } = await supabase
      .from('users')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('id', userId)
      .single();

    if (settingsError) {
      // Don't block on this — quiet hours is a scheduling concern, and failing
      // closed here would stall every automated send on a transient error.
      console.error(`Quiet-hours settings lookup failed for user ${userId}:`, settingsError);
    } else {
      const qh = checkQuietHours(settings, recipientState);
      if (qh.inQuietHours) {
        console.log(
          `🌙 Deferred: ${phone} is in quiet hours — ${qh.localTime} ${qh.timezone} ` +
            `(${qh.basis} time, window ${qh.window.start}-${qh.window.end})`
        );
        return {
          allowed: false,
          reason: 'quiet_hours',
          retryable: true,
          detail: `Outside sending window (${qh.localTime} ${qh.timezone}, ${qh.basis} local time)`,
        };
      }
    }
  }

  // 1. DNC list (user-level + global). This is the authoritative gate — it
  //    matches on normalized_phone, so write entries via the add_to_dnc RPC
  //    rather than inserting into dnc_list directly (see docs/SYSTEM_STATE.md).
  const { data: dncCheck, error: dncError } = await supabase.rpc('check_dnc', {
    p_user_id: userId,
    p_phone_number: phone,
  });

  if (dncError) {
    console.error(`❌ DNC check failed for ${phone} (user ${userId}) — blocking send:`, dncError);
    return { allowed: false, reason: 'check_failed', detail: dncError.message };
  }

  const dnc = typeof dncCheck === 'string' ? JSON.parse(dncCheck) : dncCheck;

  if (dnc?.on_dnc_list) {
    const listType: 'user' | 'global' = dnc.on_user_list ? 'user' : 'global';
    console.log(`🚫 Blocked: ${phone} is on the ${listType} DNC list (reason: ${dnc.reason})`);

    if (logBlocked) {
      const { error: histError } = await supabase.from('dnc_history').insert({
        user_id: userId,
        phone_number: phone,
        normalized_phone: dnc.normalized_phone,
        action: 'blocked',
        list_type: listType,
        result: true,
        metadata: { reason: dnc.reason, source: dnc.source, ...context },
      });
      if (histError) {
        // Non-fatal: the send is still blocked, we just lost the audit row.
        console.error('Failed to log blocked send to dnc_history:', histError);
      }
    }

    return {
      allowed: false,
      reason: 'dnc',
      detail: dnc.reason || 'On do-not-call list',
      listType,
      normalizedPhone: dnc.normalized_phone,
    };
  }

  // 2. Defense in depth: the lead's own opt-in flag. Matched against both the
  //    raw and normalized number because `leads.phone` isn't stored in a
  //    guaranteed format.
  const candidates = [phone, dnc?.normalized_phone].filter(
    (p, i, a): p is string => typeof p === 'string' && a.indexOf(p) === i
  );

  const { data: leadRows, error: leadError } = await supabase
    .from('leads')
    .select('id, sms_opt_in')
    .eq('user_id', userId)
    .in('phone', candidates);

  if (leadError) {
    // Don't fail the send on this — the DNC gate above already passed, and it
    // is the authoritative check. Log so it's visible if it starts happening.
    console.error(`sms_opt_in lookup failed for ${phone} (user ${userId}):`, leadError);
  } else if (leadRows?.some((l) => l.sms_opt_in === false)) {
    console.log(`🚫 Blocked: lead ${phone} has sms_opt_in = false (user ${userId})`);
    return { allowed: false, reason: 'opted_out', detail: 'Lead has opted out of SMS' };
  }

  // 3. Per-contact frequency. Last, because it is the only temporary block left
  //    and the permanent ones above should answer first — a contact on the DNC
  //    list should be told that, not that they are in a cooldown.
  const contact = await checkContactLimits(
    supabase,
    userId,
    candidates,
    rateOut.limits ?? DEFAULT_LIMITS
  );
  if (contact) {
    if (logBlocked) console.log(`🛑 ${phone}: ${contact.detail}`);
    return contact;
  }

  return { allowed: true };
}

/**
 * Record why a pending scheduled row was not sent this cycle (#128).
 *
 * Every automated path already distinguishes a permanent block from a retryable
 * one and handles both correctly — but the retryable branch wrote *nothing*. It
 * logged to the console and moved on, so a message pending because of a rate cap
 * or quiet hours was **indistinguishable from a cron that never ran**, which is
 * precisely the failure #61 took months to notice.
 *
 * Deliberately NOT `error_message`: that field accompanies `status='failed'` and
 * means the message is over. A deferral is the opposite — the row is healthy and
 * waiting — and writing it there would make an ordinary overnight quiet-hours
 * wait render as a failure everywhere the message is listed.
 *
 * Never throws and never blocks the run. Failing to write the note is not a
 * reason to stop processing the rest of the batch; it is logged and ignored.
 */
export async function noteDeferred(
  supabase: SupabaseClient,
  scheduledMessageId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('scheduled_messages')
    .update({ last_deferred_reason: reason, last_deferred_at: new Date().toISOString() })
    .eq('id', scheduledMessageId)
    // Only a row still waiting. A row that reached 'sent' or 'failed' in a
    // concurrent run must not be relabelled as deferred.
    .eq('status', 'pending');

  if (error) {
    console.error(`Could not record deferral for scheduled message ${scheduledMessageId}:`, error);
  }
}

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

export interface SmsGuardResult {
  allowed: boolean;
  /** Machine-readable reason when blocked. */
  reason?: 'dnc' | 'opted_out' | 'quiet_hours' | 'check_failed';
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

  return { allowed: true };
}

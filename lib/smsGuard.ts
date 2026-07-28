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

export interface SmsGuardResult {
  allowed: boolean;
  /** Machine-readable reason when blocked: 'dnc' | 'opted_out' | 'check_failed' */
  reason?: 'dnc' | 'opted_out' | 'check_failed';
  /** Human-readable detail, safe to log. */
  detail?: string;
  /** Present when blocked by DNC. */
  listType?: 'user' | 'global';
  normalizedPhone?: string;
}

interface GuardOptions {
  /** Recorded in dnc_history.metadata when a send is blocked, for audit. */
  context?: Record<string, unknown>;
  /** Set false to skip writing a dnc_history 'blocked' row. Default true. */
  logBlocked?: boolean;
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
  const { context, logBlocked = true } = options;

  if (!phone) {
    return { allowed: false, reason: 'check_failed', detail: 'No phone number provided' };
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

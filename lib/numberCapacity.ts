// How much traffic one number has taken, and whether to keep using it (#123 gap 2).
//
// ── This is not the design recorded in the issue, and here is why ───────────
//
// #123 proposed: "extend get_send_counts to return per-number counts; block on
// account **or** number limit." Straightforward, and wrong in two ways.
//
// **A hard per-number block gives single-number accounts nothing.**
// `user_telnyx_numbers.phone_number` is globally unique, so a number belongs to
// one tenant at a time, and Growth is one number (#120). For those accounts the
// per-number count selects exactly the same rows as the per-account count — so
// a per-number cap is not a new dimension of control, only a second, lower
// account cap. Every Growth customer would get a limit cut with nothing gained.
//
// **For multi-number accounts, refusing is the wrong response.** If one number
// is carrying too much and the account holds three others sitting idle, the
// useful behaviour is to *send from a different number*, not to refuse a send
// the account has ample capacity for.
//
// So this splits into two mechanisms with different jobs:
//
//   SOFT   a selection preference. `resolveFromNumber` avoids a number over its
//          soft threshold while any other is under. This is where the value for
//          Scale accounts is: load spreads across numbers before anything is
//          ever blocked, which is what protects each number's reputation.
//
//   HARD   a circuit breaker. Deliberately set ABOVE the per-account defaults,
//          so for a single-tenant number the account cap always binds first and
//          this never fires. It exists for the one case the account cap cannot
//          see: a **recycled pool number**, whose traffic spans tenants.
//
// ── Why counting across tenants is the whole point ──────────────────────────
//
// Numbers are handed on between businesses (lib/numberPool.ts). The 30-day
// quarantine is explicitly not a hard block — when the pool runs dry a number
// goes to a new business early, carrying its reputation. Every account can then
// sit inside its own cap while the *number* takes more than any single account
// would be allowed. That is the gap, and it is why `get_number_send_counts` has
// no user_id predicate.
//
// ── On the numbers below ────────────────────────────────────────────────────
//
// **These are reasoned starting points, not measured.** There is not enough
// production traffic to calibrate against — 73 message rows, most of it seed
// data. They are derived from two things that are known:
//
//   * The per-account defaults are 10/minute, 100/hour, 1000/day
//     (lib/smsGuard DEFAULT_LIMITS). Every hard ceiling here sits above its
//     account equivalent, which is what guarantees no single-number account is
//     newly restricted.
//   * Credits bind far below either. Growth's 3,000/month is ~100 messages a
//     day and Scale's 10,000 is ~333 (docs/SYSTEM_STATE.md). So normal traffic
//     is nowhere near these, by design.
//
// Revisit once there is real volume. A threshold nobody has checked against
// reality is a guess wearing a constant's clothing.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Above this, a number is avoided when another is available. */
export const SOFT_PER_DAY = 250;

/**
 * Above any of these, a number is refused outright.
 * Each sits above the matching per-account default (10 / 100 / 1000).
 */
export const HARD_PER_MINUTE = 60;
export const HARD_PER_HOUR = 200;
export const HARD_PER_DAY = 1200;

export interface NumberCapacity {
  phoneNumber: string;
  lastMinute: number;
  lastHour: number;
  lastDay: number;
  /** Over a hard ceiling — must not be used. */
  exhausted: boolean;
  /** Over the soft threshold — avoid if anything else is available. */
  heavilyUsed: boolean;
  /** Why it is exhausted, for a message the user can act on. Empty otherwise. */
  reason: string;
}

/**
 * Read per-number counts for a set of numbers.
 *
 * @param supabase MUST be a service-role client. The RPC is SECURITY DEFINER and
 *                 granted to service_role only, because counting across tenants
 *                 is deliberately an RLS-crossing read.
 * @returns one entry per requested number, including numbers with no traffic —
 *          a caller that has to tell "no sends" from "absent from the result"
 *          will eventually get it wrong. On failure returns an empty map, which
 *          excludes nothing: see the fail-open note below.
 */
export async function getNumberCapacity(
  supabase: SupabaseClient,
  phoneNumbers: string[]
): Promise<Map<string, NumberCapacity>> {
  const out = new Map<string, NumberCapacity>();
  if (!phoneNumbers.length) return out;

  const { data, error } = await supabase.rpc('get_number_send_counts', {
    p_numbers: phoneNumbers,
  });

  if (error) {
    // Fails OPEN, matching checkSendRate. A capacity check that cannot run is
    // not evidence of abuse, and refusing every send across the product because
    // one RPC is unavailable would be a far worse outcome than briefly not
    // spreading load. The per-account cap still applies underneath.
    console.error('get_number_send_counts failed — capacity not applied:', error);
    return out;
  }

  for (const row of (data || []) as any[]) {
    out.set(
      row.phone_number,
      classifyCapacity(row.phone_number, {
        lastMinute: Number(row.last_minute) || 0,
        lastHour: Number(row.last_hour) || 0,
        lastDay: Number(row.last_day) || 0,
      })
    );
  }

  return out;
}

/**
 * Apply the thresholds to a set of counts.
 *
 * Pure and exported so the boundaries can be tested directly — the alternative
 * is producing 1,200 real messages to see whether a ceiling fires, which is not
 * a test anyone runs twice.
 *
 * Comparisons are `>=`, so a threshold of 1200 means the 1200th send is the one
 * refused. Consistent with `sent >= cap` in lib/smsGuard.
 */
export function classifyCapacity(
  phoneNumber: string,
  counts: { lastMinute: number; lastHour: number; lastDay: number }
): NumberCapacity {
  const { lastMinute, lastHour, lastDay } = counts;

  // Reported most-immediate first: "60 in the last minute" tells the user what
  // is happening now, where "1200 today" would not.
  let reason = '';
  if (lastMinute >= HARD_PER_MINUTE) reason = `${lastMinute} messages in the last minute`;
  else if (lastHour >= HARD_PER_HOUR) reason = `${lastHour} messages in the last hour`;
  else if (lastDay >= HARD_PER_DAY) reason = `${lastDay} messages in the last day`;

  return {
    phoneNumber,
    lastMinute,
    lastHour,
    lastDay,
    exhausted: reason !== '',
    heavilyUsed: lastDay >= SOFT_PER_DAY,
    reason,
  };
}

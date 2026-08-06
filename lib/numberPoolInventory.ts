// Know the toll-free pool is running out before a customer does. (#120)
//
// Day-one policy, settled: a new agent gets a **shared toll-free** number from
// the pool. Local numbers require the agent's own 10DLC registration first,
// which is why onboarding does not offer one (#1, #18).
//
// That makes pool inventory a hard cap on signups. At the time this was written
// there were two unassigned numbers. Signup number three reaches the number step,
// finds nothing, and is told "you can add one later" — a paying customer, halfway
// through onboarding, with no way to send. Nothing anywhere warned that the floor
// was two.
//
// The point of this file is that the operator finds out first. It is checked at
// claim time, because a burst of signups can drain a pool between nightly runs,
// and again on the nightly job for the case where nobody claims but stock is
// already low.

import { alertAdminsThrottled } from '@/lib/alerting';

/** Warn here. Chosen to leave room to order and verify more before hitting zero. */
export const POOL_LOW_THRESHOLD = 5;

export interface PoolInventory {
  available: number;
  /** True once stock is at or below the warning threshold. */
  low: boolean;
  /** True when a signup right now would find nothing. */
  empty: boolean;
}

/**
 * Count claimable toll-free numbers.
 *
 * "Claimable" has to match what /api/number-pool/available actually offers —
 * unassigned AND verified. A number sitting in the pool without TFV cannot carry
 * traffic, so counting it would report inventory that does not exist.
 */
export async function readPoolInventory(
  admin: { from: (t: string) => any }
): Promise<PoolInventory | null> {
  const { count, error } = await admin
    .from('number_pool')
    .select('id', { count: 'exact', head: true })
    .eq('is_assigned', false)
    .eq('is_verified', true);

  // supabase-js returns { error }; it does not throw. A failed count must not be
  // reported as "plenty left" — the caller decides what to do with null.
  if (error) {
    console.error('pool inventory: could not count available numbers:', error.message);
    return null;
  }

  const available = count ?? 0;
  return { available, low: available <= POOL_LOW_THRESHOLD, empty: available === 0 };
}

/**
 * Alert if stock is low. Safe to call on every claim — the alert is throttled by
 * a stable key, so a burst of signups produces one alert, not one per signup.
 *
 * Never throws and never blocks the caller: this runs alongside a customer
 * finishing onboarding, and a monitoring failure must not cost them their number.
 */
export async function warnIfPoolLow(
  admin: { from: (t: string) => any },
  context: { trigger: 'claim' | 'nightly' | 'onboarding_empty' }
): Promise<PoolInventory | null> {
  try {
    const inventory = await readPoolInventory(admin);
    if (!inventory || !inventory.low) return inventory;

    await alertAdminsThrottled({
      key: inventory.empty ? 'number_pool_empty' : 'number_pool_low',
      title: inventory.empty
        ? 'The toll-free number pool is EMPTY — new signups cannot get a number'
        : `Only ${inventory.available} toll-free number(s) left in the pool`,
      body: inventory.empty
        ? 'A new agent reaching the number step right now gets nothing and cannot send. Day-one signups are served entirely from the shared toll-free pool — local numbers need the agent\'s own 10DLC registration first — so an empty pool is a hard stop on onboarding, not a degraded experience. Order and verify more toll-free numbers.'
        : `Day-one signups are served from this pool, so this is a cap on how many more agents can onboard. Toll-free numbers need TFV before they count as available, and that takes time — order now rather than at zero.`,
      data: { available: inventory.available, threshold: POOL_LOW_THRESHOLD, trigger: context.trigger },
      // An empty pool is actively costing signups; do not wait for someone to log in.
      escalate: inventory.empty,
    });

    return inventory;
  } catch (error) {
    console.error('pool inventory: check failed:', error);
    return null;
  }
}

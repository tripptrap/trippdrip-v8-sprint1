import { getNumberHealth } from '@/lib/telnyx';
import { alertAdminsThrottled } from '@/lib/alerting';

/**
 * Shared-pool reuse policy (#38).
 *
 * Carrier filtering attaches to the phone number, not to the tenant holding it.
 * When a business releases a pool number, whatever reputation it built — spam
 * complaints, blocks, filtering — stays with the number and transfers whole to
 * the next business that claims it. That business experiences it as "HyveWyre's
 * SMS doesn't work", with nothing in the product able to explain why.
 */

/**
 * How long a released number sits out before being offered again.
 *
 * Not a hard block. With three numbers in the pool a strict cooldown could leave
 * nothing to hand a new customer, and refusing to onboard is a worse outcome
 * than reusing a clean number early — so `evaluateClaim` degrades instead, and
 * says so loudly.
 */
export const QUARANTINE_DAYS = 30;

/**
 * Above this, a number is not handed to anyone regardless of cooldown. A number
 * with real spam history is not "aging out" of it in 30 days, and passing it on
 * exports one business's problem to another.
 */
export const SPAM_RATIO_LIMIT = 0.05;

export function isQuarantined(row: { quarantined_until?: string | null }): boolean {
  return !!row.quarantined_until && new Date(row.quarantined_until) > new Date();
}

/**
 * Release a pool number: snapshot its carrier health, close the history row and
 * start the cooldown, in one RPC.
 *
 * The health snapshot has to be taken *now* — once the number moves on, its
 * metrics move with it, and the question "was it already in trouble when the
 * last tenant gave it back" becomes unanswerable.
 *
 * Never throws. Both callers are finishing something the user already committed
 * to (releasing a number, deleting an account); failing that because bookkeeping
 * failed would be the wrong trade.
 */
export async function releasePoolNumber(
  admin: any,
  phoneNumber: string,
  userId: string | null,
  reason: string
): Promise<{ pooled: boolean; quarantinedUntil?: string }> {
  let health: Record<string, number> | null = null;
  try {
    const h = await getNumberHealth(phoneNumber);
    if (h.ok) {
      health = {
        message_count: h.messageCount,
        spam_ratio: h.spamRatio,
        success_ratio: h.successRatio,
        inbound_outbound_ratio: h.inboundOutboundRatio,
      };
    }
  } catch {
    // A snapshot is nice to have; the cooldown is the part that matters.
  }

  const { data, error } = await admin.rpc('release_pool_number', {
    p_phone_number: phoneNumber,
    p_user_id: userId,
    p_reason: reason,
    p_quarantine_days: QUARANTINE_DAYS,
    p_health: health,
  });

  if (error) {
    console.error(`Failed to release pool number ${phoneNumber}:`, error);
    return { pooled: false };
  }

  const result = data as { pool_number?: boolean; quarantined_until?: string };
  if (result?.pool_number) {
    console.log(`🔒 Pool number ${phoneNumber} released (${reason}); quarantined until ${result.quarantined_until}`);
  }
  return { pooled: !!result?.pool_number, quarantinedUntil: result?.quarantined_until };
}

export type ClaimDecision =
  | { allow: true; recycled: boolean }
  | { allow: false; status: number; message: string };

/**
 * Decide whether this pool number may go to this business right now.
 *
 * Order matters. Spam history is checked first and is absolute; the cooldown is
 * checked second and yields when the pool has nothing else, because an empty
 * pool must not stop someone signing up.
 */
export async function evaluateClaim(
  admin: any,
  poolRow: { id: string; phone_number: string; quarantined_until?: string | null }
): Promise<ClaimDecision> {
  const health = await getNumberHealth(poolRow.phone_number);

  // `ok: false` means Telnyx could not answer, which is not evidence of a
  // problem. Blocking onboarding on an API hiccup would be a self-inflicted
  // outage, so this fails open and leaves a trail.
  if (health.ok && health.spamRatio > SPAM_RATIO_LIMIT) {
    console.error(
      `⛔ Refusing to assign ${poolRow.phone_number}: spam_ratio ${health.spamRatio} exceeds ${SPAM_RATIO_LIMIT}`
    );
    await alertAdminsThrottled({
      key: `pool_number_burned:${poolRow.phone_number}`,
      title: 'A pool number has carrier spam history and is being withheld',
      body: `${poolRow.phone_number} reports spam_ratio ${health.spamRatio} (limit ${SPAM_RATIO_LIMIT}) over ${health.messageCount} messages, so it is no longer being handed to new businesses. It needs retiring and replacing rather than recycling — reputation does not age out of a number in a cooldown.`,
      data: { phone_number: poolRow.phone_number, ...health },
      windowMinutes: 1440,
    });
    return {
      allow: false,
      status: 409,
      message: 'That number is not currently available for new accounts. Please choose another.',
    };
  }

  if (!health.ok) {
    console.warn(`Could not read Telnyx health for ${poolRow.phone_number} (${health.error}) — allowing the claim`);
  }

  if (!isQuarantined(poolRow)) {
    return { allow: true, recycled: false };
  }

  const { count } = await admin
    .from('number_pool')
    .select('id', { count: 'exact', head: true })
    .eq('is_assigned', false)
    .eq('is_verified', true)
    .or(`quarantined_until.is.null,quarantined_until.lt.${new Date().toISOString()}`);

  if ((count ?? 0) > 0) {
    return {
      allow: false,
      status: 409,
      message: 'That number was recently in use and is resting. Please choose one of the other available numbers.',
    };
  }

  // Nothing else to give. Hand it over rather than block the signup, and make
  // sure somebody knows the pool is empty.
  console.warn(`⚠️ Pool exhausted — assigning quarantined number ${poolRow.phone_number}`);
  await alertAdminsThrottled({
    key: 'pool_exhausted',
    title: 'Number pool is empty — recycling a quarantined number',
    body: `Every verified pool number is either assigned or inside its ${QUARANTINE_DAYS}-day cooldown, so ${poolRow.phone_number} was handed to a new business early rather than blocking their signup. It previously belonged to someone else, so its carrier reputation comes with it. Add inventory (#3).`,
    data: { phone_number: poolRow.phone_number, quarantined_until: poolRow.quarantined_until },
    windowMinutes: 720,
  });

  return { allow: true, recycled: true };
}

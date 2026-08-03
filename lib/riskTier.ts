// Limits that tighten when an account's signals worsen, and relax when they
// recover — with nobody in the loop either way (#123 gap 4).
//
// ── What this replaces ──────────────────────────────────────────────────────
//
// Caps came from `user_settings.spam_protection` and never moved. An account
// with a 9% opt-out rate got the same allowance as one at 0.2%. The data to
// tell them apart already existed — `get_number_health_stats` computes opt-out
// rate per number, and the Phone Numbers page renders a verdict from it — but
// nothing *acted* on it. The only response to a deteriorating account was a
// human noticing a badge and clicking Rest.
//
// ── Two properties that matter more than the numbers ────────────────────────
//
// **It recovers by itself.** The window is rolling, so as bad traffic ages out
// the tier improves with no operator action. A throttle that needs a human to
// lift it is a suspension with extra steps.
//
// **It never reaches zero.** The worst tier still permits a tenth of normal.
// Cutting an account off entirely is a suspension — a deliberate, reversible,
// accountable decision that belongs to an operator, and `account_status`
// already exists for it. An automatic system that can silently take a paying
// customer to zero is one bad threshold away from an outage nobody ordered.
// Instead the worst tier throttles hard and alerts, and a human decides.
//
// ── Why a minimum volume is not optional ────────────────────────────────────
//
// Run against real production data while building this, a live account reported
// an **80% opt-out rate** — 4 opt-outs on 5 sends, from someone testing STOP.
// Without a volume floor that account would have been throttled to the bone on
// five messages of noise. Any rate computed over a handful of sends is not a
// measurement.

import type { SupabaseClient } from '@supabase/supabase-js';
import { alertAdminsThrottled } from './alerting';

/**
 * Opt-out thresholds, shared with the per-number health view so the two places
 * that judge "is this bad" cannot drift apart. Both were defined locally in
 * app/api/telnyx/numbers/health before this.
 *
 * **Starting points, not measured** — there is not enough production traffic to
 * calibrate against. Carrier guidance for marketing SMS treats low single-digit
 * percentages as healthy, so 3% warns and 5% is where a number is worth
 * resting. Revisit at real volume.
 */
export const OPT_OUT_WATCH = 0.03;
export const OPT_OUT_REST = 0.05;
/** Below this many sends, a rate is noise. 1 opt-out in 4 is 25% and means nothing. */
export const MIN_SENDS_FOR_A_VERDICT = 50;

/** Above this share of sends scoring as spam, the account is treated one tier worse. */
const HIGH_SPAM_SHARE = 0.2;

/**
 * How much sooner an account on SHARED infrastructure is throttled (#129).
 *
 * A business starts on a pool toll-free so it can work immediately while its own
 * registration completes. That number is shared infrastructure: it is covered by
 * HyveWyre's verification, it gets recycled to another business later, and its
 * reputation is everyone's. Damage to a business's own local number costs that
 * business; damage to a pool number costs every business.
 *
 * ── Why thresholds tighten rather than tiers starting worse ─────────────────
 *
 * The obvious move is to start a shared-number account one tier down. That
 * punishes every new signup for being new — halving their limits on day one,
 * before they have done anything — and credits already cap them far below.
 *
 * Halving the thresholds instead means a clean account on a pool number is
 * treated exactly like any other, and a deteriorating one is caught twice as
 * early. No cost for being new; a faster response to actual harm, which is the
 * only thing that threatens the shared verification.
 */
const SHARED_NUMBER_SENSITIVITY = 0.5;

export type RiskTier = 'healthy' | 'watch' | 'poor' | 'critical';

export interface AccountRisk {
  tier: RiskTier;
  /** Multiplies every configured send cap. Never 0 — see the header. */
  factor: number;
  sends: number;
  optOuts: number;
  optOutRate: number;
  highSpamSends: number;
  /** Plain-English explanation, safe to show the account owner. */
  reason: string;
}

const FACTORS: Record<RiskTier, number> = {
  healthy: 1,
  watch: 0.5,
  poor: 0.25,
  critical: 0.1,
};

const WORSE: Record<RiskTier, RiskTier> = {
  healthy: 'watch',
  watch: 'poor',
  poor: 'critical',
  critical: 'critical',
};

export interface RiskSignals {
  sends: number;
  optOuts: number;
  optOutRate: number;
  highSpamSends: number;
}

/**
 * Classify an account from its signals.
 *
 * Pure and exported so the boundaries are testable without manufacturing months
 * of traffic — the same reasoning as `classifyCapacity`.
 */
export function classifyRisk(
  s: RiskSignals,
  opts: { onSharedNumber?: boolean } = {}
): AccountRisk {
  // Tighter thresholds, not a worse starting tier — see SHARED_NUMBER_SENSITIVITY.
  const k = opts.onSharedNumber ? SHARED_NUMBER_SENSITIVITY : 1;
  const watchAt = OPT_OUT_WATCH * k;
  const restAt = OPT_OUT_REST * k;

  const base = {
    sends: s.sends,
    optOuts: s.optOuts,
    optOutRate: s.optOutRate,
    highSpamSends: s.highSpamSends,
  };

  if (s.sends < MIN_SENDS_FOR_A_VERDICT) {
    return {
      ...base,
      tier: 'healthy',
      factor: 1,
      reason: `Only ${s.sends} message${s.sends === 1 ? '' : 's'} in the window — not enough to judge.`,
    };
  }

  let tier: RiskTier;
  if (s.optOutRate >= restAt * 2) tier = 'critical';
  else if (s.optOutRate >= restAt) tier = 'poor';
  else if (s.optOutRate >= watchAt) tier = 'watch';
  else tier = 'healthy';

  // Content the detector would have blocked, sent anyway because the account
  // turned blocking off. A weaker signal than what recipients did, so it shifts
  // the tier rather than setting it.
  const spammyShare = s.sends > 0 ? s.highSpamSends / s.sends : 0;
  const spamPushed = spammyShare >= HIGH_SPAM_SHARE;
  if (spamPushed) tier = WORSE[tier];

  const pct = (s.optOutRate * 100).toFixed(1);
  const reason =
    tier === 'healthy'
      ? `${pct}% opt-out rate over ${s.sends} messages — healthy.`
      : `${pct}% of recipients opted out over ${s.sends} messages` +
        (spamPushed ? `, and ${s.highSpamSends} were flagged as spam risk` : '') +
        `. Sending limits are reduced until this improves.` +
        (opts.onSharedNumber
          ? ' This account sends from a shared starter number, so limits tighten sooner than they would on your own number.'
          : '');

  return { ...base, tier, factor: FACTORS[tier], reason };
}

/**
 * Read an account's signals and classify them.
 *
 * @param supabase service-role client — the RPC is SECURITY DEFINER, service_role only.
 * @param days rolling window. Seven days is short enough to recover from within
 *             a week and long enough to accumulate a meaningful denominator.
 * @returns healthy on any failure. Fails OPEN, matching every other rate check:
 *          being unable to read the signals is not evidence of abuse, and
 *          throttling the whole product because one RPC is unavailable would be
 *          far worse than briefly not throttling one bad account.
 */
/**
 * Per-account cache.
 *
 * The tier is computed over a rolling 7-day window, so it cannot meaningfully
 * change between two messages in a bulk loop — but without this it costs a round
 * trip on every one of them, and this guard already makes several. Sixty seconds
 * bounds how long a newly-deteriorated account keeps its old allowance.
 *
 * Per-process, so serverless gives each instance its own. That is fine: the
 * throttle is a coarse instrument and does not need to be exact.
 */
const riskCache = new Map<string, { at: number; risk: AccountRisk }>();
const RISK_CACHE_MS = 60_000;

/** Testing seam — consecutive assertions are meaningless against a cache. */
export function clearRiskCache(): void {
  riskCache.clear();
}

export async function getAccountRisk(
  supabase: SupabaseClient,
  userId: string,
  days = 7
): Promise<AccountRisk> {
  const hit = riskCache.get(userId);
  if (hit && Date.now() - hit.at < RISK_CACHE_MS) return hit.risk;

  const healthy = (reason: string): AccountRisk => ({
    tier: 'healthy',
    factor: 1,
    sends: 0,
    optOuts: 0,
    optOutRate: 0,
    highSpamSends: 0,
    reason,
  });

  try {
    const { data, error } = await supabase.rpc('get_account_risk_signals', {
      p_user_id: userId,
      p_days: days,
    });

    if (error) {
      console.error(`get_account_risk_signals failed for ${userId} — treating as healthy:`, error);
      return healthy('Risk signals unavailable.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return healthy('No signals yet.');

    // Is this account still on shared infrastructure? (#129)
    //
    // "Shared" means every number it holds came from the pool. Once it has its
    // own number, new conversations move there and it is judged normally — even
    // though existing conversations stay pinned to the toll-free, because those
    // are established relationships rather than new outreach.
    //
    // Fails to "not shared" on any error: tightening someone's limits because a
    // lookup failed is the wrong direction.
    let onSharedNumber = false;
    try {
      const [{ count: owned }, { count: pooled }] = await Promise.all([
        supabase.from('user_telnyx_numbers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'active'),
        supabase.from('number_pool')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to_user_id', userId),
      ]);
      onSharedNumber = (owned ?? 0) > 0 && (owned ?? 0) === (pooled ?? 0);
    } catch (e) {
      console.error(`Shared-number check failed for ${userId} — treating as own number:`, e);
    }

    const risk = classifyRisk({
      sends: Number(row.sends) || 0,
      optOuts: Number(row.opt_outs) || 0,
      optOutRate: Number(row.opt_out_rate) || 0,
      highSpamSends: Number(row.high_spam_sends) || 0,
    }, { onSharedNumber });

    // The throttle is automatic; SUSPENSION is not, and this is what puts that
    // decision in front of a human. Keyed per account and throttled, because
    // this runs on every send — without both, one bad account would generate an
    // alert per message.
    if (risk.tier === 'critical') {
      await alertAdminsThrottled({
        key: `account_risk_critical:${userId}`,
        title: 'An account is being auto-throttled for opt-outs',
        body:
          `Account ${userId} is at a ${(risk.optOutRate * 100).toFixed(1)}% opt-out rate ` +
          `(${risk.optOuts} of ${risk.sends} messages over ${days} days) and its send limits ` +
          `have been automatically cut to ${Math.round(risk.factor * 100)}% of configured. ` +
          `That happens on its own and lifts on its own. Deciding whether this warrants ` +
          `suspension does not — review the account.`,
        data: { user_id: userId, tier: risk.tier, opt_out_rate: risk.optOutRate, sends: risk.sends },
        windowMinutes: 720,
      }).catch(err => console.error('Risk alert failed:', err));
    }

    riskCache.set(userId, { at: Date.now(), risk });
    return risk;
  } catch (e) {
    console.error(`Risk lookup threw for ${userId} — treating as healthy:`, e);
    return healthy('Risk signals unavailable.');
  }
}

/**
 * Apply a risk factor to a configured cap.
 *
 * **Floors at 1 rather than 0.** `lib/smsGuard` blocks on `sent >= cap` guarded
 * by `cap >= 0`, and treats 0 as *zero allowed* — deliberately, since that is
 * how an operator stops an account. So `Math.round(10 * 0.1)` producing 1 is
 * fine, but a smaller cap rounding to 0 would silently convert a throttle into
 * a total block that no human authorised. This function is the only place that
 * conversion happens, so it is the only place that needs to be careful.
 */
export function applyRiskFactor(cap: number, factor: number): number {
  if (cap <= 0) return cap; // 0 is an operator's deliberate stop — leave it alone.
  return Math.max(1, Math.round(cap * factor));
}

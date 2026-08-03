// The whole platform's traffic, and the shared verification it runs on (#123 gap 3).
//
// ── What is actually at risk ────────────────────────────────────────────────
//
// Every agent sends toll-free under HyveWyre's **single shared TFV** (#120).
// There is no published per-verification throughput number to enforce — a TFV
// is a verification, not a quota. What it can do is be **revoked**, and what
// gets it revoked is complaints.
//
// So the aggregate opt-out rate is the real exposure, and it is invisible to
// every control built so far: fifty accounts can each sit comfortably inside
// their own threshold while the total is what a carrier would act on. No
// per-account limit can see that, by construction.
//
// ── Why the two signals get opposite treatment ──────────────────────────────
//
// **Aggregate opt-out rate ALERTS. It never blocks.**
// Blocking on it would stop every customer sending — including every
// well-behaved one — because of an aggregate they cannot individually see or
// influence. That is a total product outage triggered by a threshold, and it is
// exactly the failure mode gap 4 was careful to avoid. Whether a bad aggregate
// warrants pausing the platform is an operator's judgement, and they need to be
// told, not overruled.
//
// **Aggregate volume BLOCKS.**
// Different thing entirely. A total far above normal is not a busy day, it is a
// loop, a bad migration, or a compromised account — and it is the fastest way to
// lose the verification for everyone. The ceiling is sized as a runaway
// detector, not a business limit: it should be unmistakably abnormal to reach
// it, and it is configurable so growth never quietly runs into it.
//
// ── Caching, because this is now the seventh query on the send path ─────────
//
// The value is identical for every account and moves slowly, which makes it the
// one signal on this path that is genuinely safe to cache. Sixty seconds bounds
// how long a runaway can continue undetected while removing almost all of the
// cost. Per-process, so serverless gives each instance its own — which is fine:
// the ceiling is a blunt instrument and does not need to be exact.

import type { SupabaseClient } from '@supabase/supabase-js';
import { alertAdminsThrottled } from './alerting';

/**
 * Total outbound messages, all accounts, in 24 hours, above which sending stops.
 *
 * **Configurable, and meant to be raised deliberately as the business grows.**
 * The default is a runaway detector: with a handful of live accounts and credits
 * capping Growth at ~100 messages a day, real traffic is orders of magnitude
 * below this. If it is ever reached, something is wrong rather than popular.
 */
const DEFAULT_CEILING = 25_000;

export function platformDailyCeiling(): number {
  const raw = Number(process.env.PLATFORM_DAILY_SEND_CEILING);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CEILING;
}

/** Warn at this share of the ceiling, so it is never reached without notice. */
const WARN_AT = 0.8;

/** Aggregate opt-out rate that warrants telling a human. Alert only — see the header. */
const PLATFORM_OPT_OUT_ALERT = 0.03;

/**
 * Below this many platform-wide sends, the aggregate rate is noise.
 *
 * The same lesson as gap 4, and it bit here too: the live 7-day aggregate today
 * reads an 80% opt-out rate, from 4 opt-outs across 5 real sends.
 */
const MIN_SENDS_FOR_A_PLATFORM_VERDICT = 200;

export interface PlatformState {
  sends: number;
  optOuts: number;
  optOutRate: number;
  activeAccounts: number;
  ceiling: number;
  /** True when the aggregate ceiling is reached and sending must stop. */
  overCeiling: boolean;
}

let cached: { at: number; state: PlatformState } | null = null;
const CACHE_MS = 60_000;

/** Testing seam — the cache would otherwise make consecutive assertions meaningless. */
export function clearPlatformCache(): void {
  cached = null;
}

/**
 * Read the platform aggregate, cached for 60 seconds.
 *
 * Fails OPEN on any error, like every other rate check here: being unable to
 * read the aggregate is not evidence of a problem, and refusing every send
 * across every account because one RPC is unavailable would cause exactly the
 * outage this is supposed to prevent.
 */
export async function getPlatformState(supabase: SupabaseClient): Promise<PlatformState> {
  const ceiling = platformDailyCeiling();
  const now = Date.now();

  if (cached && now - cached.at < CACHE_MS) return cached.state;

  const idle: PlatformState = {
    sends: 0,
    optOuts: 0,
    optOutRate: 0,
    activeAccounts: 0,
    ceiling,
    overCeiling: false,
  };

  try {
    const { data, error } = await supabase.rpc('get_platform_signals', { p_hours: 24 });
    if (error) {
      console.error('get_platform_signals failed — platform ceiling not applied:', error);
      return idle;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return idle;

    const state: PlatformState = {
      sends: Number(row.sends) || 0,
      optOuts: Number(row.opt_outs) || 0,
      optOutRate: Number(row.opt_out_rate) || 0,
      activeAccounts: Number(row.active_accounts) || 0,
      ceiling,
      overCeiling: (Number(row.sends) || 0) >= ceiling,
    };

    cached = { at: now, state };
    await raiseAlerts(state);
    return state;
  } catch (e) {
    console.error('Platform signals threw — ceiling not applied:', e);
    return idle;
  }
}

/**
 * Tell a human before, and when, something needs deciding.
 *
 * Throttled and keyed per condition — this is reached at most once a minute per
 * process by the cache above, but several processes and a long incident would
 * still be noisy without it.
 */
async function raiseAlerts(s: PlatformState): Promise<void> {
  if (s.overCeiling) {
    await alertAdminsThrottled({
      key: 'platform_ceiling_reached',
      title: 'Platform send ceiling reached — all sending is stopped',
      body:
        `${s.sends} messages across ${s.activeAccounts} account(s) in 24 hours has reached the ` +
        `platform ceiling of ${s.ceiling}, and outbound sending is now refused for everyone. ` +
        `This ceiling is a runaway detector, not a business limit — if the traffic is legitimate, ` +
        `raise PLATFORM_DAILY_SEND_CEILING. If it is not, find the account or loop responsible ` +
        `before raising it.`,
      data: { sends: s.sends, ceiling: s.ceiling, accounts: s.activeAccounts },
      escalate: true,
      windowMinutes: 60,
    }).catch(err => console.error('Platform ceiling alert failed:', err));
  } else if (s.sends >= s.ceiling * WARN_AT) {
    await alertAdminsThrottled({
      key: 'platform_ceiling_approaching',
      title: 'Platform sending is approaching its ceiling',
      body:
        `${s.sends} messages in 24 hours, against a ceiling of ${s.ceiling}. Sending stops for ` +
        `every account when the ceiling is reached. Raise PLATFORM_DAILY_SEND_CEILING if this is ` +
        `real growth.`,
      data: { sends: s.sends, ceiling: s.ceiling, accounts: s.activeAccounts },
      windowMinutes: 180,
    }).catch(err => console.error('Platform ceiling warning failed:', err));
  }

  // Alert only, deliberately. See the header: blocking here would take the
  // product down for every well-behaved account over an aggregate none of them
  // can see.
  if (s.sends >= MIN_SENDS_FOR_A_PLATFORM_VERDICT && s.optOutRate >= PLATFORM_OPT_OUT_ALERT) {
    await alertAdminsThrottled({
      key: 'platform_opt_out_rate_high',
      title: 'Platform-wide opt-out rate is high — the shared TFV is exposed',
      body:
        `${(s.optOutRate * 100).toFixed(1)}% of recipients opted out across the whole platform ` +
        `(${s.optOuts} of ${s.sends} messages, ${s.activeAccounts} account(s), last 24h). Every ` +
        `agent sends under one shared toll-free verification, so this is the number that gets it ` +
        `revoked — and individual accounts can each look fine while the total does not. ` +
        `Nothing has been blocked: stopping every customer over an aggregate they cannot see is ` +
        `a decision for a person. Check per-account risk tiers to find who is contributing.`,
      data: { opt_out_rate: s.optOutRate, opt_outs: s.optOuts, sends: s.sends, accounts: s.activeAccounts },
      escalate: true,
      windowMinutes: 360,
    }).catch(err => console.error('Platform opt-out alert failed:', err));
  }
}

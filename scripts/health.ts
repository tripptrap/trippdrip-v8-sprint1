/**
 * One command that asserts the things that have actually broken here.
 *
 *   npm run health          human output, exits non-zero on any FAIL
 *   npm run health -- --json   machine output, for CI or a cron
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Almost every bug found on 2026-08-05/06 was SILENT. A 200 with an empty body.
 * An unchecked `{ error }`. A cached read returning last hour's row. A charge
 * that moved the balance and wrote no ledger line. None of it threw, so none of
 * it showed up in logs, and each one was found only because somebody happened to
 * compare two numbers by hand.
 *
 * Every check below is one of those comparisons, made once and kept. The point
 * is not speed — it is that these become assertions that fail loudly instead of
 * things somebody remembers to look at.
 *
 * Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and optionally
 * TELNYX_API_KEY (its checks are skipped rather than failed without it).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Level = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

interface Result {
  name: string;
  level: Level;
  detail: string;
  /** Why this is worth asserting — printed on anything that is not a PASS. */
  because?: string;
}

const results: Result[] = [];
const add = (r: Result) => results.push(r);

/** A check that throws must not take the rest of the sweep down with it. */
async function check(name: string, fn: () => Promise<Result>): Promise<void> {
  try {
    add(await fn());
  } catch (err: any) {
    add({ name, level: 'FAIL', detail: `check itself failed: ${err?.message ?? err}` });
  }
}

// ── checks ───────────────────────────────────────────────────────────────────

async function cronFreshness(db: SupabaseClient): Promise<Result> {
  const name = 'crons are running';
  const { data, error } = await db.rpc('find_overdue_crons');
  if (error) return { name, level: 'FAIL', detail: error.message };

  const overdue = (data as any[]) ?? [];
  if (overdue.length === 0) return { name, level: 'PASS', detail: 'none overdue' };

  return {
    name,
    level: 'FAIL',
    detail: overdue.map((c: any) => `${c.job ?? c.name} last ran ${c.last_ran_at ?? '?'}`).join('; '),
    because: 'A stopped cron is invisible — nothing sends, nothing errors, and the queue just grows.',
  };
}

async function poolInventory(db: SupabaseClient): Promise<Result> {
  const name = 'toll-free pool has stock';
  const { count, error } = await db
    .from('number_pool')
    .select('id', { count: 'exact', head: true })
    .eq('is_assigned', false)
    .eq('is_verified', true);
  if (error) return { name, level: 'FAIL', detail: error.message };

  const available = count ?? 0;
  if (available === 0) {
    return {
      name, level: 'FAIL', detail: '0 claimable numbers',
      because: 'Day-one signups are served entirely from this pool. Empty means onboarding stops dead.',
    };
  }
  if (available <= 5) {
    return {
      name, level: 'WARN', detail: `${available} claimable`,
      because: 'Toll-free needs TFV before it counts as available, and that takes days. Ordering at zero is too late.',
    };
  }
  return { name, level: 'PASS', detail: `${available} claimable` };
}

async function stuckDeliveries(db: SupabaseClient): Promise<Result> {
  const name = 'delivery receipts are landing';
  // Bounded to the last 7 days on purpose. There are ~61 older rows stuck at
  // 'sent' that can never resolve — 55 carry ids that are not Telnyx ids at all
  // (test fixtures) and Telnyx has no record of the other 6, confirmed by
  // running scripts/backfill-delivery-status.ts. Counting those would make this
  // check warn for ever, and a check that always warns is one people stop
  // reading. What matters is whether receipts are landing NOW.
  const oldest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .in('status', ['sent', 'queued'])
    .gte('created_at', oldest)
    .lt('created_at', cutoff);
  if (error) return { name, level: 'FAIL', detail: error.message };

  const stuck = count ?? 0;
  if (stuck === 0) return { name, level: 'PASS', detail: 'nothing stuck in the last 7 days' };
  return {
    name, level: 'WARN', detail: `${stuck} outbound still 'sent'/'queued' after an hour`,
    because: 'The webhook ignored message.finalized for months, so every delivery result was dropped and rows sat at sent for ever while Telnyx had them delivered (#135).',
  };
}

async function chargesAreLedgered(db: SupabaseClient): Promise<Result> {
  const name = 'charges write ledger rows';
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: sent, error: e1 }, { count: rows, error: e2 }] = await Promise.all([
    db.from('messages').select('id', { count: 'exact', head: true })
      .eq('direction', 'outbound').gte('created_at', since),
    db.from('points_transactions').select('id', { count: 'exact', head: true })
      .eq('action_type', 'spend').gte('created_at', since),
  ]);
  if (e1 || e2) return { name, level: 'FAIL', detail: (e1 ?? e2)!.message };

  if ((sent ?? 0) === 0) return { name, level: 'PASS', detail: 'no outbound in 24h, nothing to reconcile' };
  if ((rows ?? 0) === 0) {
    return {
      name, level: 'FAIL', detail: `${sent} outbound message(s), 0 spend rows`,
      because: 'This is exactly the #137 signature: deduct_credits moved the balance and wrote no history, so "where did my points go" had no answer.',
    };
  }
  return { name, level: 'PASS', detail: `${sent} outbound, ${rows} spend row(s)` };
}

async function dncIntegrity(db: SupabaseClient): Promise<Result> {
  const name = 'DNC entries are usable';
  const { data, error } = await db
    .from('dnc_list')
    .select('id, phone_number, normalized_phone')
    .is('normalized_phone', null)
    .limit(5);
  if (error) return { name, level: 'FAIL', detail: error.message };

  if ((data ?? []).length === 0) return { name, level: 'PASS', detail: 'every entry is normalised' };
  return {
    name, level: 'FAIL', detail: `${data!.length}+ entries with no normalized_phone`,
    because: 'Enforcement matches on normalized_phone. A row without one is on the list but blocks nothing — STOP opt-outs failed silently for months this way.',
  };
}

async function catalogHygiene(db: SupabaseClient): Promise<Result[]> {
  const { data, error } = await db.rpc('health_catalog_checks');
  if (error) {
    return [{ name: 'database hardening', level: 'FAIL', detail: error.message }];
  }
  const c = data as {
    rls_disabled: string[];
    secdef_mutable_search_path: string[];
    unfenced_grants: string[];
    anon_dml: string[];
    credit_rpc_overexposed: string[];
  };

  const out: Result[] = [];

  out.push(c.rls_disabled.length === 0
    ? { name: 'RLS on every table', level: 'PASS', detail: 'all tables protected' }
    : {
        name: 'RLS on every table', level: 'FAIL', detail: c.rls_disabled.join(', '),
        because: 'RLS is the row filter behind every policy. A table without it exposes every row to any role holding a grant.',
      });

  // anon lost INSERT/UPDATE/DELETE on 2026-08-07 (#149). It can come back on its
  // own: Supabase's default privileges re-grant DML to anon on tables created by
  // postgres/supabase_admin, and ALTER DEFAULT PRIVILEGES FOR ROLE is not grantable
  // from the migration role — so the revoke cannot be made permanent, only checked.
  out.push(c.anon_dml.length === 0
    ? { name: 'anon cannot write', level: 'PASS', detail: 'no INSERT/UPDATE/DELETE granted' }
    : {
        name: 'anon cannot write', level: 'FAIL',
        detail: `${c.anon_dml.length} grant(s): ${c.anon_dml.slice(0, 6).join(', ')}${c.anon_dml.length > 6 ? ', …' : ''}`,
        because: 'RLS is a row filter, not an authorisation boundary — one table with a grant and no policy is world-writable (#149).',
      });

  out.push(c.credit_rpc_overexposed.length === 0
    ? { name: 'credit RPCs are service-role only', level: 'PASS', detail: 'not granted to anon/authenticated' }
    : {
        name: 'credit RPCs are service-role only', level: 'FAIL', detail: c.credit_rpc_overexposed.join(', '),
        because: 'A user who can call add_credits mints their own balance. A test account went 0 -> 999,999 in one request (#114).',
      });

  out.push(c.unfenced_grants.length === 0
    ? { name: 'no RLS-bypassing grants', level: 'PASS', detail: 'TRUNCATE/REFERENCES/TRIGGER revoked' }
    : {
        name: 'no RLS-bypassing grants', level: 'FAIL', detail: c.unfenced_grants.join(', '),
        because: 'TRUNCATE ignores row policies. Where DELETE could only remove the caller\'s rows, TRUNCATE empties the table for everyone (#145).',
      });

  out.push(c.secdef_mutable_search_path.length === 0
    ? { name: 'SECURITY DEFINER fns pin search_path', level: 'PASS', detail: 'all pinned' }
    : {
        name: 'SECURITY DEFINER fns pin search_path', level: 'WARN',
        detail: `${c.secdef_mutable_search_path.length} unpinned: ${c.secdef_mutable_search_path.slice(0, 5).join(', ')}${c.secdef_mutable_search_path.length > 5 ? ', …' : ''}`,
        because: 'These run as the owner; the caller picks the schema search order and can shadow what the body references (#151).',
      });

  return out;
}

async function telnyxBalance(): Promise<Result> {
  const name = 'Telnyx balance';
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) return { name, level: 'SKIP', detail: 'TELNYX_API_KEY not set' };

  const res = await fetch('https://api.telnyx.com/v2/balance', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { name, level: 'WARN', detail: `Telnyx returned HTTP ${res.status}` };

  const d = (await res.json())?.data;
  const balance = Number(d?.balance ?? 0);
  const detail = `$${balance.toFixed(2)} ${d?.currency ?? ''}`.trim();

  if (balance < 5) {
    return {
      name, level: 'FAIL', detail,
      because: 'A negative balance is what made Telnyx deny every number order in July — it looked like a compliance problem for days.',
    };
  }
  if (balance < 25) {
    return {
      name, level: 'WARN', detail,
      because: 'Sending stops when this hits zero, and auto-recharge has been off.',
    };
  }
  return { name, level: 'PASS', detail };
}

// A pool row marked assigned with no owner can never be claimed or reclaimed.
//
// number_pool.assigned_to_user_id is a FK to users with ON DELETE SET NULL, so if
// releasePoolNumber() fails during an account deletion the owner is nulled while
// is_assigned stays true — and releasePoolNumber swallows its own RPC error and
// returns { pooled: false } rather than throwing, so nothing noticed (#173).
// Claim queries filter on is_assigned = false, so the row is permanently invisible.
// Against 2 claimable numbers, losing one this way is a third of onboarding.
async function strandedPoolNumbers(db: SupabaseClient): Promise<Result> {
  const name = 'no stranded pool numbers';
  const { data, error } = await db
    .from('number_pool')
    .select('phone_number')
    .eq('is_assigned', true)
    .is('assigned_to_user_id', null);

  if (error) return { name, level: 'WARN', detail: error.message };
  if ((data ?? []).length > 0) {
    return {
      name, level: 'FAIL',
      detail: data!.map(r => r.phone_number).join(', '),
      because: 'Assigned with a null owner — no claim query can ever see these again; reset is_assigned (#173).',
    };
  }
  return { name, level: 'PASS', detail: 'every assigned row has an owner' };
}

// users.credits must equal SUM(points_transactions.points_amount) per user.
//
// It did not, for four of seven accounts and 109,968 points, because add_credits
// and deduct_credits used to move the balance without writing a ledger row. That
// is fixed (both now do the balance write and the ledger insert inside one plpgsql
// function), and the historical gap was closed on 2026-08-07 with one
// `reconciliation` row per account — balance authoritative, per the owner's call
// (#183).
//
// This assertion is the point of that work: drift is only meaningful once it is
// zero, and any NEW drift means another write path is moving credits without
// recording them. That is the exact bug class this project keeps producing.
async function ledgerReconciles(db: SupabaseClient): Promise<Result> {
  const name = 'balances match the ledger';
  const { data: users, error: uErr } = await db.from('users').select('id, email, credits');
  if (uErr) return { name, level: 'WARN', detail: uErr.message };

  const { data: tx, error: tErr } = await db
    .from('points_transactions')
    .select('user_id, points_amount');
  if (tErr) return { name, level: 'WARN', detail: tErr.message };

  const ledger = new Map<string, number>();
  for (const t of tx ?? []) {
    ledger.set(t.user_id, (ledger.get(t.user_id) ?? 0) + (t.points_amount ?? 0));
  }

  const drifted = (users ?? [])
    .map(u => ({ email: u.email, drift: (u.credits ?? 0) - (ledger.get(u.id) ?? 0) }))
    .filter(u => u.drift !== 0);

  if (drifted.length > 0) {
    const worst = drifted.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 5);
    return {
      name, level: 'FAIL',
      detail: worst.map(d => `${d.email} ${d.drift > 0 ? '+' : ''}${d.drift}`).join(', '),
      because: 'A balance moved without a ledger row — some write path is not going through add_credits/deduct_credits (#183).',
    };
  }
  return { name, level: 'PASS', detail: `all ${users?.length ?? 0} accounts reconcile` };
}

// A paid tier is supposed to be the shadow of a Stripe subscription: the webhook
// sets subscription_tier on checkout and re-grants credits on each invoice.paid.
// An account holding `growth` or `scale` with no stripe_subscription_id therefore
// gets the tier's allowance and its pack discount with nothing billing it, and its
// next_renewal_date is frozen at whatever signup wrote — which is what made #185
// look like a missing renewal cron when the renewal path was working correctly for
// the one account that actually had a subscription.
//
// Do NOT "fix" a stale next_renewal_date by granting credits from a cron. That is
// precisely what lib/renewalSystem.ts documents as removed: it treated a null date
// as "renewal overdue" and handed every new signup a free month on first page load.
async function paidTiersAreBilled(db: SupabaseClient): Promise<Result> {
  const name = 'paid tiers have a subscription';
  const { data, error } = await db
    .from('users')
    .select('email, subscription_tier, stripe_subscription_id')
    .in('subscription_tier', ['growth', 'scale']);

  if (error) return { name, level: 'WARN', detail: error.message };

  const unbilled = (data ?? []).filter(u => !u.stripe_subscription_id);
  if (unbilled.length > 0) {
    return {
      name, level: 'WARN',
      detail: `${unbilled.length} of ${data?.length ?? 0}: ${unbilled.map(u => u.email).join(', ')}`,
      because: 'A paid tier with no subscription bills nobody and never renews — the credits are free (#185).',
    };
  }
  return { name, level: 'PASS', detail: `all ${data?.length ?? 0} backed by a subscription` };
}

// A Telnyx number with no messaging profile cannot send, and its inbound is
// delivered nowhere — silently, with the number still reading `active`. All ten
// numbers ordered on 2026-08-06 landed this way (#184): the four in-app order
// paths all pass `messaging_profile_id`, but an ad-hoc `number_orders` call
// omitted it, and nothing anywhere noticed for a day. The order response does
// not echo the profile per number, so the only way to know is to ask afterwards.
async function messagingProfiles(): Promise<Result> {
  const name = 'numbers have a messaging profile';
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) return { name, level: 'SKIP', detail: 'TELNYX_API_KEY not set' };

  const res = await fetch('https://api.telnyx.com/v2/phone_numbers?page%5Bsize%5D=100', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { name, level: 'WARN', detail: `Telnyx returned HTTP ${res.status}` };

  const numbers: any[] = (await res.json())?.data ?? [];
  const orphaned = numbers.filter(n => !n.messaging_profile_id);

  if (orphaned.length > 0) {
    return {
      name, level: 'FAIL',
      detail: `${orphaned.length} of ${numbers.length}: ${orphaned.map(n => n.phone_number).join(', ')}`,
      because: 'Without a profile a number cannot send and its inbound goes nowhere, while still reporting active.',
    };
  }

  // Having a profile is not enough — the profile has to carry a webhook, or
  // inbound to those numbers is delivered nowhere just as silently. The account
  // had two profiles with the SAME name and only one with a webhook, so choosing
  // the wrong one in the Telnyx UI was a coin flip nothing would have caught
  // (#188). Checked per number rather than per profile: what matters is whether a
  // number the product actually uses can receive.
  const profRes = await fetch('https://api.telnyx.com/v2/messaging_profiles?page%5Bsize%5D=100', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!profRes.ok) {
    return { name, level: 'WARN', detail: `all ${numbers.length} attached; profile check failed HTTP ${profRes.status}` };
  }
  const profiles: any[] = (await profRes.json())?.data ?? [];
  const webhookless = new Set(profiles.filter(p => !p.webhook_url).map(p => p.id));
  const deaf = numbers.filter(n => webhookless.has(n.messaging_profile_id));

  if (deaf.length > 0) {
    return {
      name, level: 'FAIL',
      detail: `${deaf.length} on a profile with no webhook: ${deaf.map(n => n.phone_number).join(', ')}`,
      because: 'The number sends fine but its inbound is delivered nowhere — the six-month silent failure in #108, by a different route.',
    };
  }

  return { name, level: 'PASS', detail: `all ${numbers.length} attached, profiles have webhooks` };
}

async function tollFreeVerification(): Promise<Result> {
  const name = 'toll-free verification';
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) return { name, level: 'SKIP', detail: 'TELNYX_API_KEY not set' };

  // page/page_size are REQUIRED — the endpoint 400s without them — and the array
  // comes back under `records`, not `data`. Both cost real time to rediscover.
  const res = await fetch(
    'https://api.telnyx.com/v2/messaging_tollfree/verification/requests?page=1&page_size=50',
    { headers: { Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return { name, level: 'WARN', detail: `Telnyx returned HTTP ${res.status}` };

  const body = await res.json();
  const records: any[] = body?.records ?? body?.data ?? [];
  const pending = records.filter(r => !/verified/i.test(String(r.verificationStatus ?? '')));
  const rejected = records.filter(r => /reject/i.test(String(r.verificationStatus ?? '')));

  if (rejected.length > 0) {
    return {
      name, level: 'WARN',
      detail: `${rejected.length} rejected, ${pending.length} not yet verified`,
      because: 'A rejected TFV means those numbers cannot send. Two were rejected here before one passed.',
    };
  }
  if (pending.length > 0) {
    return { name, level: 'WARN', detail: `${pending.length} awaiting verification`, because: 'Those numbers are not claimable until this clears.' };
  }
  return { name, level: 'PASS', detail: `${records.length} request(s), all verified` };
}

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  await check('crons are running', () => cronFreshness(db));
  await check('toll-free pool has stock', () => poolInventory(db));
  await check('no stranded pool numbers', () => strandedPoolNumbers(db));
  await check('delivery receipts are landing', () => stuckDeliveries(db));
  await check('charges write ledger rows', () => chargesAreLedgered(db));
  await check('DNC entries are usable', () => dncIntegrity(db));
  for (const r of await catalogHygiene(db)) add(r);
  await check('Telnyx balance', telnyxBalance);
  await check('balances match the ledger', () => ledgerReconciles(db));
  await check('paid tiers are billed', () => paidTiersAreBilled(db));
  await check('messaging profiles', messagingProfiles);
  await check('toll-free verification', tollFreeVerification);

  const failed = results.filter(r => r.level === 'FAIL');
  const warned = results.filter(r => r.level === 'WARN');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  } else {
    const mark: Record<Level, string> = { PASS: '  ok  ', WARN: ' warn ', FAIL: ' FAIL ', SKIP: ' skip ' };
    console.log('');
    for (const r of results) {
      console.log(`${mark[r.level]} ${r.name.padEnd(38)} ${r.detail}`);
      if (r.because && r.level !== 'PASS') console.log(`        ↳ ${r.because}`);
    }
    console.log('');
    console.log(`  ${results.filter(r => r.level === 'PASS').length} passing, ${warned.length} warning, ${failed.length} failing`);
    console.log('');
  }

  // Non-zero only on FAIL. Warnings are things to plan around, not to break a
  // build over — a pool running low should not stop a deploy.
  process.exit(failed.length > 0 ? 1 : 0);
}

main();

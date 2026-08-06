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
    credit_rpc_overexposed: string[];
  };

  const out: Result[] = [];

  out.push(c.rls_disabled.length === 0
    ? { name: 'RLS on every table', level: 'PASS', detail: 'all tables protected' }
    : {
        name: 'RLS on every table', level: 'FAIL', detail: c.rls_disabled.join(', '),
        because: 'anon holds INSERT/UPDATE/DELETE on most tables. RLS is the only fence — a table without it is world-writable (#149).',
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
  await check('delivery receipts are landing', () => stuckDeliveries(db));
  await check('charges write ledger rows', () => chargesAreLedgered(db));
  await check('DNC entries are usable', () => dncIntegrity(db));
  for (const r of await catalogHygiene(db)) add(r);
  await check('Telnyx balance', telnyxBalance);
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

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { alertAdminsThrottled } from '@/lib/alerting';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, and catching that
 * would itself leak the secret's length. So both are padded to the same size and
 * the length check is a separate boolean — the byte comparison always runs over
 * the same number of bytes regardless of what was supplied.
 */
export function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const maxLen = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    const lengthsMatch = bufA.length === bufB.length;
    const bytesMatch = timingSafeEqual(paddedA, paddedB);
    return lengthsMatch && bytesMatch;
  } catch {
    return false;
  }
}

/**
 * Gate a cron route. Returns `null` when the caller is authorised, or the
 * response to return as-is when it is not:
 *
 *     const denied = requireCronAuth(req);
 *     if (denied) return denied;
 *
 * ── Why this is shared (#96) ────────────────────────────────────────────────
 *
 * There were five hand-rolled copies of this check, and they had drifted.
 * `process-scheduled` accepted both `x-cron-secret` (external cron services)
 * and `Authorization: Bearer` (Vercel Cron); the other four accepted only the
 * Bearer form. Vercel Cron sends Bearer, so production worked — but pointing an
 * external scheduler at these would have produced a partial failure that reads
 * as healthy: scheduled messages keep flowing while drips, AI drips, reminders
 * and auto-refill all silently 401.
 *
 * That is the second time the cron routes have failed by disagreeing about how
 * they are invoked — see #97, where three of them had their work on POST while
 * Vercel only ever sends GET. One implementation, one place to check.
 */
/**
 * Job name from the request path — `/api/cron/process-drips` -> `process-drips`.
 *
 * Derived rather than passed so a new cron is recorded without anyone
 * remembering to register it. The names must match the VALUES list in
 * `find_overdue_crons`, which is the one place expected intervals live.
 */
function jobNameFromPath(pathname: string): string {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'unknown';
}

/**
 * Record that a cron ran, and alert if any OTHER cron has gone quiet (#117).
 *
 * ── Why every cron checks its peers ─────────────────────────────────────────
 *
 * A watchdog needs something to run it, and anything running inside this system
 * is itself a cron — so a dedicated watchdog dies exactly when it is needed.
 * Instead each cron checks the others on the way past. Any single surviving cron
 * notices the rest have stopped, and the most frequent one runs every five
 * minutes, so detection is fast while nothing new has to be scheduled.
 *
 * If ALL of them stop, nothing here fires — which is what the external GitHub
 * Actions check is for.
 *
 * Never throws. Monitoring must not be able to take down the thing it monitors.
 */
export interface OverdueJob {
  job: string;
  expected_minutes: number;
  /** Returned by find_overdue_crons since #182. Older callers approximated it. */
  grace_minutes?: number;
  last_ran_at: string | null;
  minutes_since: number | null;
}

/**
 * Confirm the RPC's overdue list against cron_runs before waking anyone, and
 * describe each survivor from the reading that was actually verified.
 *
 * Shared by both alert paths on purpose. `recordRunAndCheckPeers` had a copy of
 * this and `/api/cron/heartbeat` had none at all — it relayed the RPC verbatim —
 * so the same false claim could arrive by either route. A hand-rolled copy of a
 * shared gate drifts; this is the gate.
 *
 * Returns `null` when the confirming read itself failed. That is NOT "nothing is
 * overdue" and NOT "everything is overdue" — it is "I cannot tell", and the only
 * safe response is to stay quiet. Treating an unreadable table as "never ran" is
 * what fired ~700 false alarms over three days (#182).
 */
export async function confirmOverdueAgainstTable(
  admin: any,
  candidates: OverdueJob[]
): Promise<{ jobs: OverdueJob[]; detail: string } | null> {
  if (!candidates.length) return { jobs: [], detail: '' };

  const { data: actualRuns, error } = await admin
    .from('cron_runs')
    .select('job, ran_at')
    .in('job', candidates.map(o => o.job))
    .order('ran_at', { ascending: false });

  if (error) {
    console.error('Could not confirm overdue crons against cron_runs — not alerting:', error);
    return null;
  }

  const lastSeen = new Map<string, string>();
  for (const r of (actualRuns || []) as { job: string; ran_at: string }[]) {
    if (!lastSeen.has(r.job)) lastSeen.set(r.job, r.ran_at);
  }

  const jobs = candidates.filter(o => {
    const seen = lastSeen.get(o.job);
    if (!seen) return true; // table agrees there is no recorded run

    const minutesSince = (Date.now() - Date.parse(seen)) / 60000;
    // The RPC returns its own grace now. This used to approximate it as
    // `expected_minutes * 1.5 + 20`, which is WIDER than the real value for both
    // low-frequency jobs — 110 vs 90 for auto-buy, 200 vs 180 for
    // send-appointment-reminders — so in that gap a genuinely dead job was flagged
    // by the RPC and then silenced here. Two schedules that disagree are worse
    // than one that is slightly wrong.
    const graceMinutes = o.grace_minutes ?? (o.expected_minutes * 1.5 + 20);
    if (minutesSince <= graceMinutes) {
      console.error(
        `⚠️ find_overdue_crons disagrees with cron_runs for "${o.job}": RPC said ` +
          `last_ran_at=${o.last_ran_at ?? 'null'}, table says ${seen} ` +
          `(${Math.round(minutesSince)}m ago, grace ${graceMinutes}m). Alert suppressed.`
      );
      return false;
    }
    return true;
  });

  // Describe from the TABLE, falling back to the RPC only where the table has
  // nothing. This is the whole of #182: the message was built from `o.last_ran_at`
  // — the RPC value this function has just decided not to trust — so it announced
  // "has never run" for jobs with hundreds of rows, every two hours, for days
  // after they had recovered. Report the reading you verified.
  const detail = jobs
    .map(o => {
      const seen = lastSeen.get(o.job);
      if (seen) {
        const mins = Math.round((Date.now() - Date.parse(seen)) / 60000);
        return `${o.job}: last ran ${mins} minutes ago (expected every ${o.expected_minutes})`;
      }
      if (o.last_ran_at) {
        return `${o.job}: last ran ${o.minutes_since} minutes ago (expected every ${o.expected_minutes})`;
      }
      return `${o.job}: has no recorded run`;
    })
    .join('; ');

  return { jobs, detail };
}

async function recordRunAndCheckPeers(job: string, source: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();

    const { error: insertError } = await admin.from('cron_runs').insert({ job, source });
    if (insertError) {
      console.error(`Could not record cron run for ${job}:`, insertError);
    }

    const { data: overdue, error: overdueError } = await admin.rpc('find_overdue_crons');
    if (overdueError) {
      console.error('Overdue-cron check failed:', overdueError);
      return;
    }

    // Exclude the job that is running right now: its own row was just written,
    // but the RPC reads a snapshot and a slow write would otherwise make a cron
    // report itself missing.
    const candidates = (overdue || []).filter((o: any) => o.job !== job);
    if (!candidates.length) return;

    // ── Confirm against the table before waking anyone ──────────────────────
    //
    // find_overdue_crons has reported `last_ran_at: null` for jobs that plainly
    // had rows. Verified from the alert history: the 03:50:26Z alert claimed
    // auto-buy had NEVER run, while cron_runs held an auto-buy row from
    // 03:00:36Z — 50 minutes earlier and well inside its 90-minute grace. Six
    // such emails went out overnight. Not reproducible on demand: the same RPC
    // called through PostgREST with the same key returns [] every time.
    //
    // Rather than keep guessing at the cause, the alert now checks the table
    // directly before firing. A single read that has been caught lying is not a
    // good enough reason to wake someone at 4am, and a watchdog that cries wolf
    // trains you to ignore the channel it shares with real outages — the exact
    // failure #117 exists to prevent.
    //
    // The direct read is also the diagnostic: when the two disagree, that gets
    // logged with both values, so the next occurrence explains itself instead of
    // requiring another investigation.
    const confirmed = await confirmOverdueAgainstTable(admin, candidates);
    if (!confirmed) return; // could not confirm — never alert on a reading we could not check
    if (!confirmed.jobs.length) return;

    const others = confirmed.jobs;
    const detail = confirmed.detail;

    await alertAdminsThrottled({
      key: `cron_overdue:${others.map((o: any) => o.job).sort().join(',')}`,
      title: 'A scheduled job has stopped running',
      body:
        `${detail}. Noticed by ${job}, which is still running, so this is not a total outage. ` +
        `A production deploy pauses Vercel Cron for around 20 minutes and the thresholds allow ` +
        `for that, so this is longer than a deploy gap. Drips, AI drips and appointment reminders ` +
        `have no backup scheduler — if one of those is listed, that work is simply not happening.`,
      data: { noticed_by: job, overdue: others },
      escalate: true,
      windowMinutes: 120,
    });
  } catch (e) {
    console.error(`Cron heartbeat failed for ${job}:`, e);
  }
}

export async function requireCronAuth(req: NextRequest): Promise<NextResponse | null> {
  // Trimmed for the same reason the SendGrid key is (#101): 11 production env
  // values carry a trailing newline, and if CRON_SECRET ever picks one up an
  // untrimmed comparison 401s all five crons at once. CRON_SECRET happens to be
  // clean today; that is not a thing to depend on.
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected) {
    console.error('❌ CRON_SECRET not configured — rejecting request');
    return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
  }

  // Accept both forms: Vercel Cron sends `Authorization: Bearer <secret>`,
  // external cron services generally send a custom header.
  const authHeader = req.headers.get('authorization') || '';
  const provided = req.headers.get('x-cron-secret') || authHeader.replace('Bearer ', '');

  if (!secureCompare(provided, expected)) {
    console.error('❌ Invalid or missing cron secret — unauthorized request');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Recorded here rather than in each route, so a new cron inherits it. Awaited
  // deliberately: un-awaited work is not guaranteed to run on Vercel — the
  // lambda can freeze the moment the response is sent — and a heartbeat that
  // sometimes fails to write is worse than none, because it reports a healthy
  // cron as dead.
  //
  // Vercel Cron sends `Authorization: Bearer`; the GitHub Actions backup sends
  // `x-cron-secret`. Telling them apart is how you notice the primary scheduler
  // has quietly stopped while the backup is covering for it.
  const source = req.headers.get('x-cron-secret') ? 'backup' : 'vercel';
  await recordRunAndCheckPeers(jobNameFromPath(req.nextUrl.pathname), source);

  return null;
}

/**
 * The same secret also authenticates internal service-to-service calls, sent as
 * `x-internal-secret` (cron → `telnyx/send-sms`, webhook → `receptionist/respond`).
 * Those two routes compared it with `===` while the cron routes went to lengths
 * to be constant-time about the identical value — so a timing oracle on either
 * would have leaked the secret guarding all of them. Same secret, same
 * protection.
 */
export function isInternalCaller(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = req.headers.get('x-internal-secret')?.trim();
  if (!expected || !provided) return false;
  return secureCompare(provided, expected);
}

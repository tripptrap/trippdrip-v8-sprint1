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
    const others = (overdue || []).filter((o: any) => o.job !== job);
    if (!others.length) return;

    const detail = others
      .map((o: any) =>
        o.last_ran_at
          ? `${o.job}: last ran ${o.minutes_since} minutes ago (expected every ${o.expected_minutes})`
          : `${o.job}: has never run`
      )
      .join('; ');

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

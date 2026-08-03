// Is anything still running? (#117)
//
// ── Why this exists separately from the peer check ──────────────────────────
//
// Every cron checks its peers when it runs (lib/cronAuth), so any single
// surviving cron notices the others have stopped. That covers the common case —
// one job broken, the rest fine — and it needs nothing new scheduled.
//
// It cannot cover the case where they ALL stop: a paused project, a bad deploy,
// a rotated secret. Nothing is left inside the system to notice, and a watchdog
// that lives in the same system dies with it.
//
// So this endpoint is called by the GitHub Actions workflow, which runs on
// infrastructure that does not depend on Vercel's scheduler at all. It is the
// only check that survives a total outage.
//
// It deliberately does NOT run any of the jobs. Firing work from a backup
// scheduler is a separate decision with real consequences — `auto-buy` charges
// a customer's card, and GitHub's shared runners throttle a */5 schedule to
// roughly hourly, which makes it a poor trigger and a fine alarm.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { alertAdminsThrottled } from '@/lib/alerting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Authenticated like any other cron route, and recorded like one — a heartbeat
  // that stops arriving is itself a signal, and it shows up in `cron_runs`
  // alongside the jobs it watches.
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  try {
    const { data: overdue, error } = await createServiceRoleClient().rpc('find_overdue_crons');

    if (error) {
      console.error('Heartbeat: overdue check failed:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const jobs = (overdue || []) as {
      job: string;
      expected_minutes: number;
      last_ran_at: string | null;
      minutes_since: number | null;
    }[];

    // The heartbeat watches the five scheduled jobs, not itself. It runs on the
    // backup workflow's cadence, which GitHub throttles unpredictably, so
    // holding it to an interval would produce noise rather than signal.
    const others = jobs.filter(j => j.job !== 'heartbeat');

    if (others.length) {
      await alertAdminsThrottled({
        key: `cron_overdue_external:${others.map(j => j.job).sort().join(',')}`,
        title: 'Scheduled jobs have stopped — seen from outside',
        body:
          others
            .map(j =>
              j.last_ran_at
                ? `${j.job}: last ran ${j.minutes_since} minutes ago (expected every ${j.expected_minutes})`
                : `${j.job}: has never run`
            )
            .join('; ') +
          `. This was noticed by the external heartbeat rather than by another cron, which means ` +
          `either those jobs alone are stopped, or nothing inside the app is running at all. ` +
          `Thresholds already allow for the ~20 minute pause after a production deploy.`,
        data: { overdue: others },
        escalate: true,
        windowMinutes: 120,
      });
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      overdue: others,
      healthy: others.length === 0,
    });
  } catch (error: any) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

-- A record that a cron actually ran (#117).
--
-- ── Why this is needed ──────────────────────────────────────────────────────
--
-- Nothing recorded cron activity at all. There was no way to answer "has
-- process-drips run today" other than reading Vercel's log viewer, which returns
-- roughly a 90-second window — and #97 already established that three of five
-- crons had never run without anyone noticing.
--
-- Two known ways they stop, neither of which raises anything today:
--
--   * **Every production deploy pauses Vercel Cron.** Measured 2026-07-31:
--     deploy 22:59Z, cron config updated 23:01Z, first invocation 23:20Z — a
--     ~19-minute gap. Tolerable, but indistinguishable from a real outage.
--   * **Only process-scheduled has a backup.** The GitHub Actions workflow
--     covers that one endpoint; drips, AI drips, auto-buy and appointment
--     reminders have nothing behind them.
--
-- A second scheduler was the obvious answer and is the weaker one: GitHub's
-- shared runners throttle a */5 schedule to roughly hourly, so it is a safety
-- net against total failure rather than a timely trigger — and `auto-buy`
-- charges a customer's card, so it must not be fired by a backup at all.
--
-- Detection catches every cause, including ones nobody has seen yet. That is
-- what this table is for.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
--
-- One row per invocation, written when the cron authenticates. Deliberately not
-- an upsert of "last run at": the history is what shows a cron running at the
-- wrong cadence, which is a failure mode a single timestamp hides.

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job         text        NOT NULL,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  -- Which trigger fired it. Vercel Cron and the GitHub Actions backup both hit
  -- the same endpoints, and telling them apart is how you notice that the
  -- primary scheduler has quietly stopped while the backup is covering.
  source      text
);

COMMENT ON TABLE public.cron_runs IS
  'One row per cron invocation, written at authentication. Used to detect a cron that has stopped running (#117).';

-- The only query this table serves: the most recent run per job.
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_ran
  ON public.cron_runs (job, ran_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS, and nothing else has any business
-- reading or writing this.

/**
 * Which jobs have not run recently enough.
 *
 * Expected intervals are held here rather than in the application so the check
 * cannot silently disagree with reality when a schedule changes in vercel.json
 * without anyone updating a constant — this is the one place to edit, and it is
 * next to the data it judges.
 *
 * `grace_minutes` is generous on purpose: a production deploy pauses Vercel Cron
 * for around 20 minutes, and an alert that fires on every deploy would be
 * trained away within a week.
 */
CREATE OR REPLACE FUNCTION public.find_overdue_crons()
RETURNS TABLE (
  job              text,
  expected_minutes integer,
  last_ran_at      timestamptz,
  minutes_since    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH expected(job, expected_minutes, grace_minutes) AS (
    VALUES
      ('process-scheduled',          5,   30),
      ('process-drips',             10,   40),
      ('process-ai-drips',          10,   40),
      ('auto-buy',                  60,   90),
      ('send-appointment-reminders', 120, 180)
  ),
  latest AS (
    SELECT e.job, e.expected_minutes, e.grace_minutes,
           (SELECT max(r.ran_at) FROM public.cron_runs r WHERE r.job = e.job) AS last_ran_at
      FROM expected e
  )
  SELECT
    l.job,
    l.expected_minutes,
    l.last_ran_at,
    CASE WHEN l.last_ran_at IS NULL THEN NULL
         ELSE (EXTRACT(EPOCH FROM (now() - l.last_ran_at)) / 60)::integer
    END AS minutes_since
  FROM latest l
  -- A job that has NEVER run is overdue by definition — that is exactly the #97
  -- case, where three crons had never fired and nothing said so.
  WHERE l.last_ran_at IS NULL
     OR l.last_ran_at < now() - make_interval(mins => l.grace_minutes);
$$;

COMMENT ON FUNCTION public.find_overdue_crons() IS
  'Jobs whose most recent run is older than their grace period, or which have never run (#117). service_role only.';

REVOKE ALL ON FUNCTION public.find_overdue_crons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_overdue_crons() TO service_role;

-- find_overdue_crons returns grace_minutes, and watches check-idle-campaigns (#182).
-- APPLIED 2026-08-07 against the linked project.
--
-- The caller (lib/cronAuth.ts) had to GUESS the grace as
-- `expected_minutes * 1.5 + 20`, because the RPC did not return it. That guess is
-- WIDER than the real grace for both low-frequency jobs:
--
--   auto-buy                     guess 110  vs  real  90
--   send-appointment-reminders   guess 200  vs  real 180
--
-- So between those numbers a job the RPC had correctly flagged as overdue was
-- actively suppressed by its own caller. A monitor with two disagreeing schedules
-- silences real outages in the gap between them.
--
-- Also adds check-idle-campaigns, which has been running on a Vercel cron and
-- writing cron_runs since 2026-08-06 while being absent from this list — so
-- nothing would ever have reported it stopped.
--
-- `heartbeat` is deliberately NOT added. It is the external GitHub-Actions
-- backstop running on a cadence GitHub throttles unpredictably; holding it to an
-- interval produces noise, and having the in-app monitor page someone because the
-- out-of-app monitor paused is not a signal about the product.
--
-- DROP first: the return type changes, and CREATE OR REPLACE cannot alter a
-- function's OUT parameters.

DROP FUNCTION IF EXISTS public.find_overdue_crons();

CREATE FUNCTION public.find_overdue_crons()
RETURNS TABLE(
  job text,
  expected_minutes integer,
  grace_minutes integer,
  last_ran_at timestamp with time zone,
  minutes_since integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH expected(job, expected_minutes, grace_minutes) AS (
    VALUES
      ('process-scheduled',           5,   30),
      ('process-drips',              10,   40),
      ('process-ai-drips',           10,   40),
      ('auto-buy',                   60,   90),
      ('send-appointment-reminders', 120,  180),
      ('check-idle-campaigns',      1440, 1560)
  ),
  latest AS (
    SELECT e.job, e.expected_minutes, e.grace_minutes,
           (SELECT max(r.ran_at) FROM public.cron_runs r WHERE r.job = e.job) AS last_ran_at
      FROM expected e
  )
  SELECT
    l.job,
    l.expected_minutes,
    l.grace_minutes,
    l.last_ran_at,
    CASE WHEN l.last_ran_at IS NULL THEN NULL
         ELSE (EXTRACT(EPOCH FROM (now() - l.last_ran_at)) / 60)::integer
    END AS minutes_since
  FROM latest l
  -- A job that has NEVER run is overdue by definition — that is exactly the #97
  -- case, where three crons had never fired and nothing said so.
  WHERE l.last_ran_at IS NULL
     OR l.last_ran_at < now() - make_interval(mins => l.grace_minutes);
$function$;

REVOKE ALL ON FUNCTION public.find_overdue_crons() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_overdue_crons() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_overdue_crons() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Watch refresh-10dlc (#1). APPLIED 2026-08-07 against the linked project.
--
-- Shipping a cron that nothing monitors is the gap #182 was about — and
-- check-idle-campaigns had been running unwatched for a day before that fix
-- caught it. This one is added in the same change as the job itself.
--
-- Hourly with a 90-minute grace, matching auto-buy. Carrier review takes days, so
-- a late check costs little, and a tight grace would only alarm on the ~20-minute
-- Vercel Cron pause after a deploy.
--
-- Supersedes 20260807_find_overdue_crons_return_grace.sql; the only difference is
-- the extra row. Full function is restated because the return type is fixed by
-- CREATE and partial edits to a VALUES list invite drift.

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
      ('refresh-10dlc',              60,   90),
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
  WHERE l.last_ran_at IS NULL
     OR l.last_ran_at < now() - make_interval(mins => l.grace_minutes);
$function$;

REVOKE ALL ON FUNCTION public.find_overdue_crons() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_overdue_crons() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_overdue_crons() TO service_role;

NOTIFY pgrst, 'reload schema';

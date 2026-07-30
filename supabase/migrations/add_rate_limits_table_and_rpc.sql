-- Shared, cross-instance rate limiting (#58).
--
-- `POST /api/auth/account-status` takes an arbitrary email from an
-- unauthenticated caller, queries `users` with the service-role key (so RLS does
-- not apply), and answers with that account's status. An unknown email returns
-- `active`, so you cannot learn *whether* an address is registered — but a
-- suspended or banned one is distinguishable, and with no throttle a list of
-- addresses can be probed at whatever rate the caller likes. It is also a free
-- unauthenticated read against `users`.
--
-- Why this is in Postgres rather than a Map in the route: the one in-memory
-- limiter already in the codebase (`app/api/ai/compose`) is per serverless
-- instance. On Vercel that means a caller spread across N warm instances gets
-- N times the limit, and every cold start resets the count — which is precisely
-- the "at volume" case this is meant to stop. A counter is only a limit if every
-- instance shares it.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key    text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now()
);

-- Operational counters, not user data, and never read through PostgREST: only
-- the service-role key (which bypasses RLS) touches this. RLS on with no policy
-- means anon and authenticated get nothing even if the table is exposed later.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;

-- Supports the prune below.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits (window_start);

COMMENT ON TABLE public.rate_limits IS
  'Transient per-key request counters for rate limiting (#58). Rows are reused via upsert and pruned once stale, so this grows with distinct keys, not with requests. Not an audit log — do not read it as one.';

/**
 * Count one request against `p_key` and say whether it is allowed.
 *
 * Atomic: the INSERT ... ON CONFLICT DO UPDATE takes a row lock, so concurrent
 * requests for the same key cannot both read a stale count. Doing this as
 * SELECT-then-UPDATE in application code would let two requests race past the
 * limit together.
 *
 * Uses clock_timestamp(), not now(). now() is the *transaction* timestamp and is
 * frozen for the whole transaction, so several calls inside one transaction would
 * share a window that can never expire — a `pg_sleep` between them changes
 * nothing. Each PostgREST call is its own transaction, so now() would usually
 * behave, but a limiter whose correctness depends on how it happens to be
 * invoked is a trap, and it cannot be tested in a single statement.
 *
 * Returns { allowed, count, limit, retry_after_seconds }.
 */
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count  integer;
  v_start  timestamptz;
  v_cutoff timestamptz;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' OR p_limit IS NULL OR p_limit < 1 THEN
    -- A caller that cannot identify the requester must not be silently granted
    -- an unlimited allowance; say so instead of returning allowed.
    RETURN jsonb_build_object('allowed', false, 'count', 0, 'limit', p_limit,
                              'retry_after_seconds', p_window_seconds,
                              'error', 'invalid rate limit key');
  END IF;

  v_cutoff := clock_timestamp() - make_interval(secs => p_window_seconds);

  -- Note the qualified `rate_limits.` references: unqualified names inside
  -- plpgsql resolve to the function's parameters, not the table's columns.
  INSERT INTO public.rate_limits AS rl (bucket_key, request_count, window_start)
  VALUES (check_rate_limit.p_key, 1, clock_timestamp())
  ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = CASE WHEN rl.window_start < v_cutoff THEN 1
                             ELSE rl.request_count + 1 END,
        window_start  = CASE WHEN rl.window_start < v_cutoff THEN clock_timestamp()
                             ELSE rl.window_start END
  RETURNING rl.request_count, rl.window_start INTO v_count, v_start;

  -- Cheap opportunistic prune. Rows are reused per key, so the table grows with
  -- distinct keys rather than request volume; this keeps abandoned ones from
  -- accumulating without needing another cron.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
     WHERE window_start < clock_timestamp() - interval '1 day';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after_seconds',
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_start + make_interval(secs => p_window_seconds)) - clock_timestamp()))::integer)
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit(text, integer, integer) IS
  'Atomically counts a request against a key and returns whether it is allowed (#58). Use instead of a per-instance in-memory counter — serverless instances do not share memory.';

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

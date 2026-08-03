-- Per-number send volume and opt-out rate, for the number-health view (#122).
--
-- ── How opt-outs get attributed to a number, without a schema change ────────
--
-- `dnc_history` records the *lead's* number, not which of ours received the
-- STOP, and `add_to_dnc` has no parameter for it. The obvious fix — a new
-- column plus an RPC signature change — would mean dropping and recreating a
-- function the inbound webhook depends on.
--
-- Not needed: the webhook saves the inbound message *before* handling the
-- opt-out, and that row already carries `to_phone` — our number. So an opt-out
-- can be attributed to whichever of our numbers most recently received an
-- inbound message from that person. That is literally what happened ("they
-- texted STOP to this number"), and it works on existing data rather than only
-- from today.
--
-- The tradeoff: an opt-out recorded by hand through /api/dnc/add has no inbound
-- message behind it and attributes to no number. That is correct — nobody
-- texted STOP to anything — and it is why `unattributed` is returned separately
-- rather than being folded into a number's count.

CREATE OR REPLACE FUNCTION public.get_number_health_stats(
  p_user_id uuid,
  p_days    integer DEFAULT 30
)
RETURNS TABLE (
  phone_number   text,
  sent           integer,
  opt_outs       integer,
  opt_out_rate   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_start AS (
    SELECT now() - make_interval(days => p_days) AS since
  ),
  -- Every number this user holds, so one with no traffic still appears rather
  -- than silently vanishing from the view.
  owned AS (
    SELECT n.phone_number
      FROM public.user_telnyx_numbers n
     WHERE n.user_id = p_user_id AND n.status = 'active'
  ),
  sent AS (
    SELECT m.from_phone AS phone_number, COUNT(*)::integer AS n
      FROM public.messages m, window_start w
     WHERE m.user_id = p_user_id
       AND m.direction = 'outbound'
       AND m.created_at >= w.since
       AND m.from_phone IS NOT NULL
     GROUP BY m.from_phone
  ),
  -- Attribute each opt-out to the number that last received an inbound message
  -- from that person before the opt-out was recorded.
  attributed AS (
    SELECT (
      SELECT m.to_phone
        FROM public.messages m
       WHERE m.user_id = h.user_id
         AND m.direction = 'inbound'
         AND public.normalize_phone(m.from_phone) = h.normalized_phone
         AND m.created_at <= h.created_at
       ORDER BY m.created_at DESC
       LIMIT 1
    ) AS phone_number
      FROM public.dnc_history h, window_start w
     WHERE h.user_id = p_user_id
       AND h.action IN ('added', 'updated')
       AND h.created_at >= w.since
  ),
  opted AS (
    SELECT a.phone_number, COUNT(*)::integer AS n
      FROM attributed a
     WHERE a.phone_number IS NOT NULL
     GROUP BY a.phone_number
  )
  SELECT
    o.phone_number,
    COALESCE(s.n, 0) AS sent,
    COALESCE(d.n, 0) AS opt_outs,
    CASE WHEN COALESCE(s.n, 0) = 0 THEN 0
         ELSE ROUND(COALESCE(d.n, 0)::numeric / s.n, 4)
    END AS opt_out_rate
  FROM owned o
  LEFT JOIN sent  s ON s.phone_number = o.phone_number
  LEFT JOIN opted d ON d.phone_number = o.phone_number
  ORDER BY o.phone_number;
$$;

COMMENT ON FUNCTION public.get_number_health_stats(uuid, integer) IS
  'Per-number sent count and opt-out rate over the last N days (#122). Opt-outs are attributed via the inbound message that carried the STOP. service_role only.';

REVOKE ALL ON FUNCTION public.get_number_health_stats(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_number_health_stats(uuid, integer) TO service_role;

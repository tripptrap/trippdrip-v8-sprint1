-- Record which of our numbers received an opt-out, and use it for health (#122).
--
-- ── Why the obvious approach cannot work ────────────────────────────────────
--
-- The first attempt attributed an opt-out to whichever number last received an
-- inbound message from that person — no schema change, and it worked on
-- historical data. It returned zero for every real opt-out.
--
-- Not a bug: `purge_lead_after_opt_out` (#109) **deletes the lead's messages**
-- when they opt out. That is deliberate and correct — someone who opted out
-- should not have their conversation retained — but it removes precisely the
-- evidence the join depended on. Any message-based attribution is guaranteed to
-- miss exactly the events it is meant to measure.
--
-- So the number has to be recorded on the opt-out itself, on a row that
-- survives the purge. `dnc_history` does: the purge keeps the suppression and
-- its audit trail and erases the person.
--
-- Written by the webhook immediately after add_to_dnc rather than through a new
-- RPC parameter: changing add_to_dnc's signature means dropping and recreating
-- a function the inbound path depends on, and re-granting it. Not worth the
-- risk for one column.

ALTER TABLE public.dnc_history
  ADD COLUMN IF NOT EXISTS received_on_number text;

COMMENT ON COLUMN public.dnc_history.received_on_number IS
  'Which of the account''s numbers the opt-out arrived on. Null for opt-outs added by hand, which arrived on no number (#122).';

CREATE INDEX IF NOT EXISTS idx_dnc_history_received_on
  ON public.dnc_history (user_id, received_on_number, created_at DESC)
  WHERE received_on_number IS NOT NULL;

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
  -- Every active number, so one with no traffic still appears rather than
  -- silently vanishing from the view.
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
  -- Only 'added' — an 'updated' row is the same person opting out again on a
  -- number already suppressed, and counting it twice would inflate the rate of
  -- whichever number happened to receive the repeat.
  opted AS (
    SELECT h.received_on_number AS phone_number, COUNT(*)::integer AS n
      FROM public.dnc_history h, window_start w
     WHERE h.user_id = p_user_id
       AND h.action = 'added'
       AND h.received_on_number IS NOT NULL
       AND h.created_at >= w.since
     GROUP BY h.received_on_number
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

REVOKE ALL ON FUNCTION public.get_number_health_stats(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_number_health_stats(uuid, integer) TO service_role;

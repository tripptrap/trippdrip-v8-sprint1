-- Aggregate send signals across ALL accounts (#123 gap 3).
--
-- ── What is actually at risk ────────────────────────────────────────────────
--
-- Every agent sends toll-free under HyveWyre's single shared TFV (#120). There
-- is no published per-verification throughput number to enforce — a TFV is a
-- verification, not a quota. What it can do is be **revoked**, and what gets it
-- revoked is complaints.
--
-- So this measures the two things that matter and they are not the same:
--
--   opt_out_rate   the real threat. Fifty accounts each comfortably inside
--                  their own threshold can still add up to an aggregate that
--                  costs everyone the verification. No per-account limit can
--                  see this, by construction.
--   sends          a runaway detector. A bug, a loop, or a compromised account
--                  spiking total volume well past normal.
--
-- Deliberately no user_id predicate — the aggregate is the point. RLS-crossing,
-- so SECURITY DEFINER, service_role only.
--
-- `active_accounts` is returned so the aggregate can be read in context: 5,000
-- sends across 50 accounts is ordinary, and across 1 is not.

CREATE OR REPLACE FUNCTION public.get_platform_signals(p_hours integer DEFAULT 24)
RETURNS TABLE (
  sends           integer,
  opt_outs        integer,
  opt_out_rate    numeric,
  active_accounts integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH w AS (SELECT now() - make_interval(hours => p_hours) AS since),
  sent AS (
    SELECT
      COUNT(*)::integer                       AS n,
      COUNT(DISTINCT m.user_id)::integer      AS accounts
    FROM public.messages m, w
    WHERE m.direction = 'outbound'
      AND m.created_at >= w.since
      -- Seed rows carry a null user_id and a fake from_phone; counting them
      -- would put the platform permanently near a ceiling for traffic that
      -- never existed.
      AND m.user_id IS NOT NULL
  ),
  opted AS (
    SELECT COUNT(*)::integer AS n
    FROM public.dnc_history h, w
    WHERE h.action = 'added'
      AND h.created_at >= w.since
  )
  SELECT
    sent.n,
    opted.n,
    CASE WHEN sent.n = 0 THEN 0 ELSE ROUND(opted.n::numeric / sent.n, 4) END,
    sent.accounts
  FROM sent, opted;
$$;

COMMENT ON FUNCTION public.get_platform_signals(integer) IS
  'Aggregate outbound volume and opt-out rate across all accounts, for the platform ceiling and shared-TFV alerting (#123 gap 3). service_role only.';

REVOKE ALL ON FUNCTION public.get_platform_signals(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_signals(integer) TO service_role;

-- The aggregate scans every account's recent sends, not one account's, so the
-- existing (user_id, direction, created_at) index does not serve it — user_id
-- leads. This one does.
CREATE INDEX IF NOT EXISTS idx_messages_outbound_created
  ON public.messages (created_at DESC)
  WHERE direction = 'outbound' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnc_history_added_created
  ON public.dnc_history (created_at DESC)
  WHERE action = 'added';

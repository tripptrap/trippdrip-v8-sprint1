-- Rolling risk signals per account (#123 gap 4).
--
-- Feeds the automatic tightening and relaxing of an account's send limits. Two
-- signals, deliberately kept separate rather than blended into one number:
--
--   opt-out rate    what recipients did. The strongest signal there is, and the
--                   one carriers ultimately act on.
--   spam scoring    what we thought of the content before it went out. Weaker,
--                   and only meaningful since #123 shipped moderation — every
--                   row before that has spam_score 0 because nothing scored it.
--
-- Blending them would hide which is wrong, and they call for different
-- responses: a high opt-out rate means the offer or the list is wrong, a high
-- spam score means the wording is.
--
-- ── Why this is per-account and get_number_send_counts is not ───────────────
--
-- Capacity (gap 2) counts a NUMBER across tenants, because a recycled number
-- carries its history to whoever holds it next. Risk is about an ACCOUNT's
-- behaviour, so it is scoped to the user — a business should not inherit a risk
-- tier from whoever held its number before.
--
-- ── Window ─────────────────────────────────────────────────────────────────
--
-- Rolling, so recovery is automatic: as bad traffic ages out of the window the
-- tier improves with no operator action. That is the whole point of gap 4 —
-- today the only response to a bad opt-out rate is a human noticing a badge.

CREATE OR REPLACE FUNCTION public.get_account_risk_signals(
  p_user_id uuid,
  p_days    integer DEFAULT 7
)
RETURNS TABLE (
  sends            integer,
  opt_outs         integer,
  opt_out_rate     numeric,
  avg_spam_score   numeric,
  high_spam_sends  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH w AS (SELECT now() - make_interval(days => p_days) AS since),
  sent AS (
    SELECT
      COUNT(*)::integer                                        AS n,
      COALESCE(ROUND(AVG(COALESCE(m.spam_score, 0)), 2), 0)    AS avg_score,
      -- 30 is the block threshold in lib/spam/detector (isSpammy). Counting
      -- sends AT or above it measures how often an account is writing content
      -- that only got through because blocking was disabled.
      COUNT(*) FILTER (WHERE COALESCE(m.spam_score, 0) >= 30)::integer AS high
    FROM public.messages m, w
    WHERE m.user_id = p_user_id
      AND m.direction = 'outbound'
      AND m.created_at >= w.since
  ),
  -- Only 'added'. An 'updated' row is someone opting out again on a number
  -- already suppressed; counting it would inflate the rate for a person who
  -- opted out once. Same rule as get_number_health_stats.
  opted AS (
    SELECT COUNT(*)::integer AS n
    FROM public.dnc_history h, w
    WHERE h.user_id = p_user_id
      AND h.action = 'added'
      AND h.created_at >= w.since
  )
  SELECT
    sent.n,
    opted.n,
    CASE WHEN sent.n = 0 THEN 0
         ELSE ROUND(opted.n::numeric / sent.n, 4)
    END,
    sent.avg_score,
    sent.high
  FROM sent, opted;
$$;

COMMENT ON FUNCTION public.get_account_risk_signals(uuid, integer) IS
  'Rolling opt-out rate and spam-score signals for one account, used to tighten or relax its send limits automatically (#123 gap 4). service_role only.';

REVOKE ALL ON FUNCTION public.get_account_risk_signals(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_risk_signals(uuid, integer) TO service_role;

-- The opt-out half of the signal runs on every send (it feeds the risk tier in
-- lib/riskTier, called from checkSendRate). dnc_history has separate indexes on
-- user_id and created_at but no composite, so at volume this would degrade into
-- a scan of one user's whole opt-out history on each message.
--
-- Partial on action='added' because that is the only action the rate counts —
-- 'checked' rows dominate the table (126 of 131 today) and are never relevant
-- here.
CREATE INDEX IF NOT EXISTS idx_dnc_history_user_added
  ON public.dnc_history (user_id, created_at DESC)
  WHERE action = 'added';

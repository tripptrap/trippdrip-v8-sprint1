-- Per-number send volume, counted ACROSS tenants (#123 gap 2).
--
-- ── Why this is not get_number_health_stats with a shorter window ───────────
--
-- `get_number_health_stats` groups outbound messages by `from_phone` — and
-- scopes the whole CTE with `m.user_id = p_user_id`. That is correct for the
-- health view, which answers "how are MY numbers doing".
--
-- It is exactly wrong here. Numbers are recycled between businesses
-- (lib/numberPool.ts), and the 30-day quarantine is explicitly **not** a hard
-- block: when the pool is exhausted a number is handed to a new business early,
-- carrying whatever reputation it already had. A per-number limit scoped to one
-- tenant would reset the moment the number changed hands, which is precisely
-- the case it exists to cover.
--
-- So there is deliberately no user_id predicate. This is an RLS-crossing read
-- and therefore SECURITY DEFINER, granted to service_role only.
--
-- ── Why an array parameter ──────────────────────────────────────────────────
--
-- The caller is `resolveFromNumber`, which already holds the account's numbers
-- and needs counts for all of them at once to choose between them. One round
-- trip per send, not one per number.

CREATE INDEX IF NOT EXISTS idx_messages_fromphone_created
  ON public.messages (from_phone, created_at DESC)
  WHERE direction = 'outbound' AND from_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_number_send_counts(p_numbers text[])
RETURNS TABLE (
  phone_number text,
  last_minute  integer,
  last_hour    integer,
  last_day     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    n                                                                        AS phone_number,
    COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '1 minute')::integer,
    COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '1 hour')::integer,
    COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '1 day')::integer
  FROM unnest(p_numbers) AS n
  -- LEFT JOIN so a number with no traffic still returns a row of zeros rather
  -- than vanishing. A caller that has to tell "no sends" from "not in the
  -- result" will eventually get it wrong.
  LEFT JOIN public.messages m
         ON m.from_phone = n
        AND m.direction  = 'outbound'
        AND m.created_at >= now() - interval '1 day'
  GROUP BY n;
$$;

COMMENT ON FUNCTION public.get_number_send_counts(text[]) IS
  'Outbound sends per number over the last minute/hour/day, counted across ALL tenants — pool numbers are recycled, so a per-tenant count would reset when a number changes hands (#123). service_role only.';

REVOKE ALL ON FUNCTION public.get_number_send_counts(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_number_send_counts(text[]) TO service_role;

-- One round trip for the three send-rate windows (#121).
--
-- Rate limits were enforced in only 2 of 7 send paths. Moving the check into
-- `lib/smsGuard.ts` covers every path at once — but the guard runs **per
-- message**, and a bulk loop of 100 would otherwise fire 300 separate COUNT
-- queries. This returns all three windows in a single statement.
--
-- Also adds the index those counts need. `messages` has 13 indexes but none on
-- (user_id, direction, created_at) — `idx_messages_user_id` alone means every
-- count scans all of a user's messages and filters. Cheap now at 66 outbound
-- rows; not at 100k.
--
-- SECURITY DEFINER because `messages` is under RLS and the crons call this as
-- service_role while acting for another user. Scoped to the p_user_id passed
-- in, and — per #114 — granted to service_role only. There is no reason for a
-- browser to call it: the numbers it returns are already visible to the user
-- through their own message list.

CREATE INDEX IF NOT EXISTS idx_messages_user_direction_created
  ON public.messages (user_id, direction, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_send_counts(p_user_id uuid)
RETURNS TABLE (
  last_minute integer,
  last_hour   integer,
  last_day    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 minute')::integer,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')::integer,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 day')::integer
  FROM public.messages
  WHERE user_id = p_user_id
    AND direction = 'outbound'
    AND created_at >= now() - interval '1 day';
$$;

COMMENT ON FUNCTION public.get_send_counts(uuid) IS
  'Outbound message counts for the last minute/hour/day, in one round trip. Used by lib/smsGuard rate limiting (#121). service_role only.';

REVOKE ALL ON FUNCTION public.get_send_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_send_counts(uuid) TO service_role;

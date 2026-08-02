-- add_credits / deduct_credits must be service-role only (#114).
--
-- Both are SECURITY DEFINER and were granted EXECUTE to `authenticated`. Their
-- guard reads:
--
--     IF v_role IS NOT NULL AND v_role <> 'service_role'
--        AND auth.uid() IS DISTINCT FROM user_id THEN  RAISE ...
--
-- which stops you acting on ANOTHER user's balance — and permits acting on your
-- own. So any logged-in user could POST /rest/v1/rpc/add_credits with their own
-- id and mint credits.
--
-- Verified against the live database before writing this: a fresh test account,
-- authenticated with its own session, one request with amount 999999 →
-- HTTP 200, balance 0 → 999999. Test account deleted afterwards.
--
-- Credits are what the point packs sell, so this was revenue, not just data.
-- There is no legitimate path where a user grants themselves credits: they come
-- from Stripe purchases and subscription grants, all server-side.
--
-- The per-user guard inside the functions is kept — defence in depth for any
-- future caller — but the grant is the control that matters.
--
-- Callers moved to the service-role client first (same commit): the refund and
-- charge in number-pool/purchase-with-credits, follow-ups/send-calendar-link,
-- and campaigns/run. Every other caller was already service-role.
--
-- FROM PUBLIC as well as the named role — revoking a named role alone silently
-- does nothing, see revoke_anon_execute_on_privileged_rpcs.sql.

REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer)    TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO service_role;

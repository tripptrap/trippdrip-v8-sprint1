-- Revoke anon EXECUTE on SECURITY DEFINER functions that write (#110 follow-on).
--
-- Twelve SECURITY DEFINER functions — which bypass RLS by definition — were
-- granted EXECUTE to **anon**. The anon key is public: it ships in the browser
-- bundle by design. So any unauthenticated caller could invoke them over
-- PostgREST, and each takes the tenant as an ordinary parameter, so the caller
-- chose which account to act on.
--
-- Proven against the live database before writing this — one POST to
-- /rest/v1/rpc/add_to_dnc with the anon key and no session, naming another
-- account's user_id, returned `{"success": true, "action": "added"}` and wrote
-- the row. (Probe row deleted afterwards.)
--
-- The two that matter most:
--
--   remove_from_dnc   un-suppress a number that opted out. The DNC row is both
--                     the thing that blocks messaging and the evidence of the
--                     opt-out; deleting it re-opens a contact who said stop.
--                     That is the compliance failure #34 already cost months.
--   schedule_message  queue outbound SMS as any user, against their number and
--                     their credits.
--
-- Also revoked: add_to_dnc, bulk_add_to_dnc, check_dnc, apply_referral_code,
-- complete_referral, get_or_create_referral_code, execute_auto_tagging_rule,
-- stop_ai_drip_on_reply.
--
-- **Revoking anon rather than adding auth.uid() scoping, deliberately.** These
-- take an explicit tenant parameter because their real callers are server-side:
-- the SMS webhook calls add_to_dnc as service_role while handling an inbound
-- STOP, where there is no session and auth.uid() is NULL. Adding a caller-scope
-- predicate would silently break opt-out persistence — the exact failure of #34.
-- Every caller was checked first: all ten are server-side API routes, none is
-- client-side, so nothing legitimately calls these as anon.
--
-- NOT addressed here: `authenticated` retains EXECUTE, and since the tenant is a
-- parameter, a logged-in user could still pass someone else's user_id. That
-- needs per-route verification of whether each route uses the request-scoped or
-- the service-role client, so it is tracked separately rather than guessed at.

-- NOTE — revoking from `anon` alone does NOT work, and looks like it does.
-- Postgres grants EXECUTE to PUBLIC by default, and anon inherits it, so the
-- named revoke removes a grant that was never what mattered. Worse, the obvious
-- verification query is blind to it: `aclexplode` renders PUBLIC as grantee oid
-- 0, which does not join to pg_roles, so a check for rolname='anon' reports
-- clean while the function is still world-callable. Caught only by re-running
-- the actual attack, which still returned HTTP 200 after the first revoke.
-- Hence `FROM PUBLIC, anon`.

REVOKE EXECUTE ON FUNCTION public.add_to_dnc(p_user_id uuid, p_phone_number character varying, p_reason character varying, p_source character varying, p_notes text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_referral_code(p_referred_user_id uuid, p_referral_code character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_add_to_dnc(p_user_id uuid, p_phone_numbers text[], p_reason character varying, p_source character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_dnc(p_user_id uuid, p_phone_number character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_referral(p_referral_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_auto_tagging_rule(p_user_id uuid, p_lead_id uuid, p_trigger_type text, p_trigger_data jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_referral_code(p_user_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_from_dnc(p_user_id uuid, p_phone_number character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_message(user_id_param uuid, lead_id_param uuid, body_param text, scheduled_for_param timestamp with time zone, channel_param character varying, subject_param character varying) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stop_ai_drip_on_reply(p_phone text) FROM PUBLIC, anon;

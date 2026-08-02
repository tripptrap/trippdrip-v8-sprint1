-- Make the tenant-parameterised SECURITY DEFINER functions service-role only (#114).
--
-- Follow-on to the anon revoke. These ten bypass RLS and take the tenant as an
-- ordinary parameter, so EXECUTE granted to `authenticated` meant any logged-in
-- user could call them directly over PostgREST with somebody else's user_id —
-- going around the API routes that carefully pass `user.id` from the session.
--
-- Reachable that way, among others:
--   remove_from_dnc   delete another account's opt-out. The dnc_list row is both
--                     the block and the evidence, so this re-opens a contact who
--                     said stop — the failure #34 already cost months.
--   schedule_message  queue SMS as any user, on their number and their credits.
--   complete_referral takes ONLY a referral id and verifies no ownership at all:
--                     it marks any pending referral complete and grants the
--                     referrer a free month. Fraud with no account of your own
--                     needed beyond a session.
--
-- Not scoped with auth.uid() instead, deliberately: the SMS webhook calls
-- add_to_dnc as service_role while handling an inbound STOP, where auth.uid() is
-- NULL. A caller-scope predicate would silently break opt-out persistence.
--
-- Every call site was checked and moved first (commit below): the four /api/dnc
-- routes, the three /api/referrals routes, /api/sms/send, and the two smsGuard
-- callers (messages/schedule/bulk, campaigns/run) now call as service_role. The
-- tenant still comes from the verified session, never from the request body.
-- schedule_message and stop_ai_drip_on_reply had no caller in the codebase at all.
--
-- FROM PUBLIC as well as the named roles — see
-- revoke_anon_execute_on_privileged_rpcs.sql for why revoking a named role alone
-- silently does nothing.

REVOKE EXECUTE ON FUNCTION public.add_to_dnc(p_user_id uuid, p_phone_number character varying, p_reason character varying, p_source character varying, p_notes text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_referral_code(p_referred_user_id uuid, p_referral_code character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_add_to_dnc(p_user_id uuid, p_phone_numbers text[], p_reason character varying, p_source character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_dnc(p_user_id uuid, p_phone_number character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_referral(p_referral_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_auto_tagging_rule(p_user_id uuid, p_lead_id uuid, p_trigger_type text, p_trigger_data jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_referral_code(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_from_dnc(p_user_id uuid, p_phone_number character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_message(user_id_param uuid, lead_id_param uuid, body_param text, scheduled_for_param timestamp with time zone, channel_param character varying, subject_param character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stop_ai_drip_on_reply(p_phone text) FROM PUBLIC, anon, authenticated;
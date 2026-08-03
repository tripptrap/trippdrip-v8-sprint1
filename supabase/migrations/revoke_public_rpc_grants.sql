-- Every SECURITY DEFINER function was callable by anyone (audit, 2026-08-03).
--
-- 54 EXECUTE grants to PUBLIC, anon or authenticated across 20 functions. The
-- anon key ships inside the public login page's JavaScript, so "anon" means
-- anyone who loads the site.
--
-- #114 fixed the ten tenant-parameterised WRITE functions and never asked which
-- READS carried the same grant. They all did.
--
-- ── The worst of them ───────────────────────────────────────────────────────
--
--   get_user_twilio_credentials(user_id_param)   CREDENTIALS, any tenant, no login
--   get_user_settings(user_id_param)             name, email, business, plan, balance
--   get_dnc_stats(p_user_id)                     phone numbers of people who opted out
--   get_service_email_stats / get_referral_stats / get_tag_usage_stats /
--   get_user_current_month_usage / has_active_referral_reward /
--   is_within_quiet_hours                        all take another tenant's id
--
--   get_messages_ready_to_send()                 EVERY tenant's pending sends
--   get_campaigns_ready_for_batch()              EVERY tenant's pending campaigns
--   get_ai_drips_ready_to_send()                 EVERY tenant's pending drips
--
--   add_thread_tag / remove_thread_tag / archive_thread / unarchive_thread /
--   bulk_archive_threads                         take a thread id and check no
--                                                ownership. #110 stopped the
--                                                ROUTES using these, but left
--                                                the grant, so they stayed
--                                                directly callable.
--
--   handle_new_user() / initialize_user_preferences()  trigger functions, which
--                                                should never be invokable at all
--
-- ── Why REVOKE names PUBLIC explicitly ─────────────────────────────────────
--
-- Naming `anon` alone is a no-op here. These are default PUBLIC grants, and
-- anon inherits them — revoking from anon leaves the PUBLIC grant in place and
-- the function still callable. That exact mistake is recorded in SYSTEM_STATE
-- from #114: a check that reported clean while the hole was open.
--
-- Verify by CALLING the function with the anon key afterwards, not by re-reading
-- the grant table.
--
-- ── Safe because nothing client-side calls an RPC ───────────────────────────
--
-- `grep -rn "\.rpc(" app/(dashboard) app/(public) app/auth components` returns
-- nothing. Every RPC call is in an API route. The five that ran on the caller's
-- own client — get_user_settings, get_dnc_stats, get_referral_stats,
-- get_tag_usage_stats, remove_thread_tag — were moved to service_role in the
-- same commit, the same way #114 moved the writes.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       -- Every SECURITY DEFINER function in public. These run as their owner
       -- and bypass RLS by design, so none of them should be reachable from a
       -- browser. The API layer decides who may call what.
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END
$$;

-- Trigger functions do not need EXECUTE granted to anything: Postgres invokes
-- them as the trigger owner. Taking it away from service_role too means they
-- cannot be called directly by anyone at all.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM service_role;
REVOKE ALL ON FUNCTION public.initialize_user_preferences() FROM service_role;

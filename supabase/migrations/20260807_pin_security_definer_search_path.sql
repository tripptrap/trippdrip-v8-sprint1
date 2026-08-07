-- Pin search_path on every SECURITY DEFINER function in public (#151).
-- APPLIED 2026-08-07 against the linked project.
--
-- These run as the function OWNER. With a mutable search_path the CALLER chooses
-- the schema resolution order, so a table or function of the same name in an
-- earlier schema is what the body actually touches. The affected set included
-- check_dnc, add_to_dnc, bulk_add_to_dnc, remove_from_dnc, schedule_message and
-- is_within_quiet_hours — the compliance gate and the send scheduler.
--
-- Safe to pin to public+pg_temp specifically here, verified against pg_proc.prosrc
-- BEFORE running:
--   * none of the 24 referenced another schema explicitly (auth, extensions, net,
--     storage, graphql, vault, pgsodium, cron);
--   * none called an extension function unqualified. pgcrypto and uuid-ossp do
--     live in `extensions`, so a single unqualified crypt() or uuid_generate_v4()
--     would have broken on pinning — there were none.
-- pg_catalog is always searched implicitly and does not need naming.
--
-- Driven off the catalog rather than a hand-written list: it targets by identity
-- arguments so overloads are handled correctly, and re-running it is a no-op
-- because already-pinned functions no longer match the filter.
--
-- Verified after applying: 0 unpinned of 49 SECURITY DEFINER functions in public,
-- and check_dnc / is_within_quiet_hours / get_messages_ready_to_send /
-- get_ai_drips_ready_to_send / get_campaigns_ready_for_batch / find_overdue_crons /
-- get_dnc_stats all still return correct results.

DO $$
DECLARE
  fn record;
  n integer := 0;
BEGIN
  FOR fn IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef
       AND (p.proconfig IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))
     ORDER BY p.proname
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path TO ''public'', ''pg_temp''',
      fn.proname, fn.args
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'pinned search_path on % function(s)', n;
END $$;

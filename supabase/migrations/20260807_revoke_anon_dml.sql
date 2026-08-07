-- Revoke INSERT/UPDATE/DELETE from `anon` across public (#149).
-- APPLIED 2026-08-07 against the linked project.
--
-- anon held all three on 58 of 63 tables, leaving RLS as the ONLY thing between an
-- unauthenticated request and a write. A 2026-08-06 audit found 41 (table, command)
-- pairs with a DML grant and NO matching policy, so the fence was demonstrably not
-- uniform — RLS is a row filter, not an authorisation boundary.
--
-- Nothing needed it. Verified BEFORE running:
--   * /api/opt-in/submit — the only public write path — uses the SERVICE ROLE.
--   * app/auth/register does no table writes at all; the handle_new_user trigger
--     creates the public.users row.
--   * app/auth/onboarding writes users and conversation_flows, but runs AFTER
--     sign-in, so it acts as `authenticated`. (Its users write touches exactly
--     business_name, timezone, business_hours, updated_at — the four columns
--     `authenticated` is granted, which is evidently why that list is what it is.)
--   * The browser client uses the anon KEY, but with a session PostgREST resolves
--     the role to `authenticated`. Revoking from `anon` does not affect sign-ins.
--
-- Verified AFTER, with the real anon key against PostgREST — every one 401
-- "permission denied":
--   INSERT leads / dnc_list / campaigns / messages / user_telnyx_numbers /
--          points_transactions
--   PATCH  leads
--   DELETE leads
-- SELECT still returns 200 with [] — RLS filters it, which is the intended state.
--
-- SELECT is deliberately untouched: RLS is on every table and policies key on
-- auth.uid(), so anon reads return nothing. Revoking it too risks breaking public
-- pages for no protection gained today. Worth its own look, not a drive-by.
--
-- `authenticated` is untouched — the app genuinely writes as that role.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon;

-- Covers tables created by the migration role. `ALTER DEFAULT PRIVILEGES FOR ROLE
-- postgres|supabase_admin` is NOT grantable from here (42501), so Supabase can
-- still re-grant DML to anon on tables those roles create. That is why
-- scripts/health.ts asserts the live grant state on every run rather than trusting
-- this to hold — the revoke cannot be made permanent, only monitored.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;

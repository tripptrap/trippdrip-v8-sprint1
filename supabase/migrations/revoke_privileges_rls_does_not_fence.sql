-- Take TRUNCATE (and the two DDL privileges beside it) away from the API roles. (#145)
--
-- ── What RLS does and does not cover ───────────────────────────────────────
--
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` is the
-- Supabase default, and the platform's assumption is that row-level security is
-- the fence. For SELECT/INSERT/UPDATE/DELETE that is true — a policy constrains
-- which rows each role can touch.
--
-- **TRUNCATE is not a row operation and RLS does not apply to it at all.** Where
-- a policy limits DELETE to the caller's own rows, TRUNCATE on the same table
-- empties it for every account in one statement. Measured before this migration:
-- granted to both anon and authenticated on 58 of 62 public tables, including
-- messages, leads, threads, users and dnc_list.
--
-- dnc_list is the one with a compliance dimension rather than only a data one:
-- it is the enforcement record for STOP opt-outs, so losing it wholesale is a
-- TCPA problem.
--
-- REFERENCES and TRIGGER go too. Both are DDL privileges — they let a role add a
-- foreign key to, or a trigger on, the table — and neither is reachable through
-- PostgREST, which has no DDL verbs. They are not fenced by RLS either. Nothing
-- in this codebase issues DDL as anon or authenticated; migrations run as
-- postgres (verified: current_user is postgres here).
--
-- ── Reachability, stated honestly ──────────────────────────────────────────
--
-- None of these three is exploitable today. PostgREST exposes no TRUNCATE and no
-- DDL, and there is no SQL-execution RPC in this project — the only candidate by
-- name, execute_auto_tagging_rule, is static PL/pgSQL. This is depth. It becomes
-- a live hole the moment anything gains dynamic SQL, a pooler connection string
-- leaks, or a future function takes a table name as an argument.
--
-- ── Deliberately NOT included ──────────────────────────────────────────────
--
-- anon also holds INSERT, UPDATE and DELETE on those same 58 tables. That is a
-- much larger question: those ARE fenced by RLS (verified — every public table
-- has RLS enabled), and public pages may legitimately write as anon. Sweeping
-- them here would risk breaking the opt-in flow to fix something that is not
-- broken. Filed separately.

BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- `REVOKE ... ON ALL TABLES` only touches tables that exist right now. Without
-- this, the next `CREATE TABLE` hands the privileges straight back — which is
-- how the default reasserts itself and how a fix like this quietly rots.
--
-- Default privileges are recorded per creating role, so this must name the role
-- that actually creates the tables. All 63 public tables are owned by postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

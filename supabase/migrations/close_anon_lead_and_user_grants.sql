-- Two live holes found by audit, 2026-08-03.
--
-- ── 1. public.lead_dashboard was world-readable AND world-writable ──────────
--
--     grantee        privileges
--     anon           SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--     authenticated  SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--
-- The anon key ships inside the public login page's JavaScript, so anyone who
-- loaded the site could read every lead — name, mobile, email, tags, pipeline
-- stage — with no account. The view is auto-updatable, so the same key could
-- also modify or delete rows in `leads` through it.
--
-- A view does not inherit the RLS of its base table unless it is declared
-- security_invoker; this one runs as its owner, so `leads`' RLS never applied.
--
-- Dropped rather than locked down. Nothing in the codebase references it —
-- `grep -rn lead_dashboard app lib components` returns nothing — so it is an
-- unused surface, and the safest lock is removal.
--
-- ── 2. `authenticated` could rewrite any column of its own users row ────────
--
-- The UPDATE policy scopes rows correctly ("Users can update own profile") but
-- a policy cannot scope COLUMNS, and the grant was whole-table. So a logged-in
-- user could set their own `credits` and `subscription_tier`:
--
--     UPDATE users SET credits = 999999, subscription_tier = 'scale'
--
-- The onboarding client already issues that exact verb against that exact table,
-- so it is a one-line change in devtools. Free credits, a free Scale plan, and
-- it re-opens the paid check that #116 just closed.
--
-- `anon` held the same grants, which it has no use for at all: the only public
-- page touching `users` is the branded opt-in page, and that uses the
-- service-role client (see app/(public)/opt-in/[slug]/page.tsx:20).
--
-- The fix is column-scoped. Onboarding writes exactly four columns
-- (app/auth/onboarding/page.tsx:257) and nothing else client-side writes this
-- table, so those four are re-granted and nothing else is.

DROP VIEW IF EXISTS public.lead_dashboard;

-- Nothing public has any business with this table.
REVOKE ALL ON TABLE public.users FROM anon;

-- Keep SELECT: RLS already scopes it to the caller's own row, and the Topbar,
-- login and onboarding all read it. Remove every write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.users FROM authenticated;

-- Exactly what onboarding saves. Anything else — credits, subscription_tier,
-- account_status, stripe ids — is server-side only, through routes that run as
-- service_role and decide for themselves.
GRANT UPDATE (business_name, timezone, business_hours, updated_at)
  ON TABLE public.users TO authenticated;

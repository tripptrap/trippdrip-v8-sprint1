-- Expose which columns `authenticated` may UPDATE on public.users.
--
-- scripts/check-user-writes.ts fails a build when a route writes a column its
-- client is not granted. Hardcoding that list there would make the check a
-- second source of truth that drifts from the grants it is meant to enforce —
-- the same failure this codebase keeps hitting — so it is read from the catalog.
--
-- Extends the existing health RPC rather than adding another: same SECURITY
-- DEFINER, same pinned search_path (which `npm run health` asserts).
CREATE OR REPLACE FUNCTION public.health_catalog_checks()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'rls_disabled', COALESCE((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ), '[]'::jsonb),

    'secdef_mutable_search_path', COALESCE((
      SELECT jsonb_agg(p.proname ORDER BY p.proname)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosecdef
         AND (p.proconfig IS NULL
              OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))
    ), '[]'::jsonb),

    'unfenced_grants', COALESCE((
      SELECT jsonb_agg(DISTINCT g.grantee || ':' || g.privilege_type)
        FROM information_schema.table_privileges g
       WHERE g.table_schema = 'public'
         AND g.grantee IN ('anon', 'authenticated')
         AND g.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    ), '[]'::jsonb),

    -- anon must never hold DML. RLS is a row filter, not an authorisation
    -- boundary: one permissive policy, or one table with a grant and no policy at
    -- all, and an unauthenticated request can write (#149). Named per table so a
    -- newly created one is identifiable rather than just a count.
    'anon_dml', COALESCE((
      SELECT jsonb_agg(DISTINCT g.table_name || ':' || g.privilege_type)
        FROM information_schema.table_privileges g
       WHERE g.table_schema = 'public'
         AND g.grantee = 'anon'
         AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ), '[]'::jsonb),

    'credit_rpc_overexposed', COALESCE((
      SELECT jsonb_agg(DISTINCT r.routine_name || ':' || r.grantee)
        FROM information_schema.routine_privileges r
       WHERE r.routine_name IN ('add_credits', 'deduct_credits')
         AND r.grantee IN ('anon', 'authenticated')
    ), '[]'::jsonb),

    -- Columns `authenticated` may UPDATE on public.users. A write to anything
    -- else through the user's client fails with "permission denied for table
    -- users" at runtime, in production (#195, and six before it).
    --
    -- A table-wide UPDATE grant would mean every column is writable, and
    -- column_privileges does not enumerate columns in that case — so that is
    -- reported explicitly rather than as an empty list, which would read as
    -- "nothing is allowed" and be exactly backwards.
    'users_authenticated_update_cols', CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.table_privileges
         WHERE table_schema='public' AND table_name='users'
           AND grantee='authenticated' AND privilege_type='UPDATE'
      ) THEN '"ALL"'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(c.column_name ORDER BY c.column_name)
          FROM information_schema.column_privileges c
         WHERE c.table_schema='public' AND c.table_name='users'
           AND c.grantee='authenticated' AND c.privilege_type='UPDATE'
      ), '[]'::jsonb)
    END
  );
$function$;

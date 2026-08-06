-- Catalog facts the health script cannot reach through PostgREST.
--
-- scripts/health.ts asserts things like "every table has RLS on" and "every
-- SECURITY DEFINER function pins its search_path". Those live in pg_catalog,
-- which supabase-js cannot query — so without this the script would need the
-- Supabase CLI and a linked project, and would not run in CI from env vars alone.
--
-- Read-only by construction: it SELECTs from the catalogs and returns jsonb.
-- SECURITY DEFINER because pg_proc.proconfig and pg_class.relrowsecurity are not
-- readable by service_role otherwise — and it pins its own search_path, which is
-- exactly the property it exists to check for everything else (#151).

CREATE OR REPLACE FUNCTION public.health_catalog_checks()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    -- Tables with RLS switched off. Should always be empty: anon holds
    -- INSERT/UPDATE/DELETE on most tables and RLS is the only fence (#149).
    'rls_disabled', COALESCE((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ), '[]'::jsonb),

    -- SECURITY DEFINER functions with a caller-controlled search_path. These run
    -- as the owner, so a shadowing object in an earlier schema hijacks them
    -- (#151). Reported as a list so a NEW one is visible, not just a count.
    'secdef_mutable_search_path', COALESCE((
      SELECT jsonb_agg(p.proname ORDER BY p.proname)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosecdef
         AND (p.proconfig IS NULL
              OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'))
    ), '[]'::jsonb),

    -- Privileges RLS does not fence, which is why they were revoked (#145).
    -- TRUNCATE ignores row policies entirely.
    'unfenced_grants', COALESCE((
      SELECT jsonb_agg(DISTINCT g.grantee || ':' || g.privilege_type)
        FROM information_schema.table_privileges g
       WHERE g.table_schema = 'public'
         AND g.grantee IN ('anon', 'authenticated')
         AND g.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    ), '[]'::jsonb),

    -- The credit RPCs must stay service_role-only. Granting EXECUTE to
    -- authenticated is how a user mints their own credits (#114).
    'credit_rpc_overexposed', COALESCE((
      SELECT jsonb_agg(DISTINCT r.routine_name || ':' || r.grantee)
        FROM information_schema.routine_privileges r
       WHERE r.routine_name IN ('add_credits', 'deduct_credits')
         AND r.grantee IN ('anon', 'authenticated')
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.health_catalog_checks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_catalog_checks() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.health_catalog_checks() TO service_role;

COMMENT ON FUNCTION public.health_catalog_checks() IS
  'Read-only catalog facts for scripts/health.ts — RLS coverage, SECURITY DEFINER search_path hygiene, unfenced grants, credit-RPC exposure. service_role only.';

NOTIFY pgrst, 'reload schema';

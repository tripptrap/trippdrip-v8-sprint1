-- Temporary diagnostic for #61. Reports the identity PostgREST resolves for the
-- caller, so a route can log what role its own requests actually run as.
-- SECURITY INVOKER on purpose: the whole point is to see the *caller's* role.
CREATE OR REPLACE FUNCTION public.whoami_probe()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'auth_role', current_setting('request.jwt.claim.role', true),
    'auth_role_claims', (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
    'current_user', current_user,
    'session_user', session_user,
    'pending_visible', (SELECT COUNT(*) FROM public.scheduled_messages WHERE status = 'pending')
  );
$$;

REVOKE ALL ON FUNCTION public.whoami_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whoami_probe() TO service_role, authenticated, anon;

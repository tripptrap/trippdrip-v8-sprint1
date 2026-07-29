-- Create the deduct_credits RPC that ten code paths already call (#90).
--
-- It never existed. CLAUDE.md listed it under "Key RPC Functions" and
-- SYSTEM_STATE.md instructed "always use the deduct_credits RPC, never
-- read-then-write" — both describing a function no migration ever created.
-- Every call returned PGRST202, which meant send-sms and process-drips failed
-- closed (UI sending returned HTTP 500) while every other send path went out
-- free.
--
-- ── Design notes, each of which is load-bearing ─────────────────────────────
--
-- * Parameter names are `user_id` and `amount` because PostgREST matches RPC
--   arguments BY NAME and the ten existing callers already send those. Renaming
--   them to the p_-prefixed house style would reproduce the original bug.
--
-- * Every reference to a parameter is qualified as `deduct_credits.<name>`.
--   `user_id` and `amount` collide with column names elsewhere in the schema,
--   and an unqualified reference in plpgsql resolves to the column — which is
--   how this class of function silently updates the wrong rows.
--
-- * The balance check lives in the UPDATE's WHERE clause, so the read and the
--   write are one atomic statement. A SELECT-then-UPDATE here would reintroduce
--   exactly the read-modify-write race this RPC exists to remove.
--
-- * COALESCE because users.credits is nullable (default 3000, but nullable).
--   Without it a NULL balance makes `credits >= amount` NULL, no row matches,
--   and the caller sees "insufficient credits" for a user who may have plenty.
--
-- * SECURITY DEFINER bypasses RLS, so the function must enforce ownership
--   itself. service_role (crons, webhooks, the Stripe handler) legitimately
--   deducts on behalf of any user; an authenticated caller must only ever be
--   able to spend their own balance. Two callers are request-scoped —
--   campaigns/run and follow-ups/send-calendar-link — so `authenticated` needs
--   EXECUTE, and without this guard any logged-in user could drain any other
--   user's credits by passing their id.

CREATE OR REPLACE FUNCTION public.deduct_credits(user_id uuid, amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance integer;
  v_role text;
BEGIN
  IF deduct_credits.amount IS NULL OR deduct_credits.amount < 0 THEN
    RAISE EXCEPTION 'deduct_credits: amount must be >= 0 (got %)', deduct_credits.amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- auth.role() is NULL on a direct database connection (psql, migrations),
  -- which is already fully privileged; the guard only applies to API callers.
  v_role := auth.role();
  IF v_role IS NOT NULL
     AND v_role <> 'service_role'
     AND auth.uid() IS DISTINCT FROM deduct_credits.user_id THEN
    RAISE EXCEPTION 'deduct_credits: cannot deduct credits for another user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.users u
     SET credits    = COALESCE(u.credits, 0) - deduct_credits.amount,
         updated_at = now()
   WHERE u.id = deduct_credits.user_id
     AND COALESCE(u.credits, 0) >= deduct_credits.amount
  RETURNING u.credits INTO v_new_balance;

  -- Distinguishes "not enough credits" from "no such user" only in the message;
  -- both are failures the caller must not treat as a successful charge.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deduct_credits: insufficient credits or unknown user %', deduct_credits.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.deduct_credits(uuid, integer) IS
  'Atomically deducts credits from a user, raising rather than going negative. Parameter names must stay user_id/amount — PostgREST matches RPC arguments by name and existing callers send those. See #90.';

-- anon must never be able to spend anyone''s credits.
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO service_role;

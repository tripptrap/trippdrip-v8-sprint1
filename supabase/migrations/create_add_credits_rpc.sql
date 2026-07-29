-- Atomic credit refund/grant, the mirror of deduct_credits (#91, #90).
--
-- Needed because a refund cannot be a snapshot restore. The number-purchase
-- route used to roll back with `update({ credits: currentCredits })` — writing
-- back the balance it read before the purchase. Anything that changed in
-- between (an SMS send, a concurrent purchase) was silently overwritten: a user
-- with 5000 who buys a 500-credit number, sends one SMS, then hits a Telnyx
-- failure would be restored to 5000, refunding the 500 *and* the unrelated 1.
--
-- Same conventions as deduct_credits, and for the same reasons:
--   * parameter names user_id / amount, because PostgREST matches by name
--   * every parameter reference qualified add_credits.<name>, because
--     unqualified plpgsql resolves them to columns
--   * one atomic UPDATE, no read-then-write
--   * SECURITY DEFINER bypasses RLS, so ownership is enforced in the function
--
-- One asymmetry worth noting: granting credits is more dangerous than spending
-- them, so authenticated callers may only credit THEIR OWN balance and the
-- guard is not optional. Refunds from request-scoped routes are the only
-- legitimate authenticated use; everything else (Stripe fulfilment, admin
-- adjustments, auto-buy) runs as service_role.

CREATE OR REPLACE FUNCTION public.add_credits(user_id uuid, amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance integer;
  v_role text;
BEGIN
  IF add_credits.amount IS NULL OR add_credits.amount < 0 THEN
    RAISE EXCEPTION 'add_credits: amount must be >= 0 (got %)', add_credits.amount
      USING ERRCODE = 'check_violation';
  END IF;

  v_role := auth.role();
  IF v_role IS NOT NULL
     AND v_role <> 'service_role'
     AND auth.uid() IS DISTINCT FROM add_credits.user_id THEN
    RAISE EXCEPTION 'add_credits: cannot add credits to another user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.users u
     SET credits    = COALESCE(u.credits, 0) + add_credits.amount,
         updated_at = now()
   WHERE u.id = add_credits.user_id
  RETURNING u.credits INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'add_credits: unknown user %', add_credits.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.add_credits(uuid, integer) IS
  'Atomically adds credits to a user. Use for refunds and grants — never restore a previously-read balance, which silently discards concurrent changes. Parameter names must stay user_id/amount (PostgREST matches by name). See #91.';

REVOKE ALL ON FUNCTION public.add_credits(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_credits(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer) TO service_role;

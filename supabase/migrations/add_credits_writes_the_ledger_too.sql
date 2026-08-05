-- Make add_credits record its grant, the way deduct_credits already records its
-- charge. (#137, second half)
--
-- ── The asymmetry ───────────────────────────────────────────────────────────
--
-- deduct_credits was fixed to write the points_transactions row inside the same
-- transaction as the balance change. add_credits was not, so "exactly one ledger
-- row per balance change" held on the spend side and only by convention on the
-- grant side — every caller had to remember to insert its own row, in a separate
-- statement, in a separate transaction.
--
-- Measured consequence, live at the time of this migration:
--
--   app/api/number-pool/purchase-with-credits refunds a failed number purchase
--   through add_credits and writes NO ledger row at all, on any of its three
--   refund paths. The matching charge DOES write one. So a failed purchase
--   leaves a -100 'spend' row and a silent +100 refund: the customer's history
--   says they were charged for a number they never received.
--
-- Ledger drift across the four real accounts, credits vs SUM(points_amount),
-- before this change: +56,968 / +30,000 / +22,000 / +1,000.
--
-- ── write_ledger, and why it exists ─────────────────────────────────────────
--
-- The Stripe webhook writes its ledger row FIRST, deliberately: two unique
-- indexes cover stripe_session_id, so the insert is what makes redelivery of the
-- same event idempotent. Grant-then-record would be a worse guard, and
-- restructuring that flow is not something that can be verified without real
-- money changing hands. Those three call sites pass write_ledger => false and
-- keep the row they already write correctly.
--
-- Everyone else takes the default and stops inserting their own.
--
-- ── stripe_session_id as an ATOMIC guard ───────────────────────────────────
--
-- Passing it in is strictly stronger than the two-statement version, and fixes a
-- real ordering bug in cron/auto-buy, which granted first and wrote its guard
-- row after — a guard cannot protect the thing that already happened. Inside
-- this function the unique violation aborts the transaction, so the grant rolls
-- back with it and a redelivered purchase cannot double-credit.
--
-- ── The PUBLIC trap, again ─────────────────────────────────────────────────
--
-- Adding parameters means DROP + CREATE (a different argument count creates a
-- second overload, and then a 2-arg call is ambiguous). A newly created function
-- grants EXECUTE to PUBLIC, which silently re-opens what
-- make_credit_rpcs_service_role_only.sql closed and what commit 2ec7ec1
-- documented. Revoking from `authenticated` alone does NOT close it — PUBLIC
-- includes every role. The REVOKE FROM PUBLIC below is load bearing.
--
-- Pre-change grants, from information_schema.routine_privileges:
--   postgres EXECUTE, service_role EXECUTE. No anon, no authenticated, no PUBLIC.
-- Restored exactly at the bottom.

BEGIN;

DROP FUNCTION IF EXISTS public.add_credits(uuid, integer);

CREATE OR REPLACE FUNCTION public.add_credits(
  user_id            uuid,
  amount             integer,
  reason             text    DEFAULT NULL,
  action_type        text    DEFAULT 'earn',
  stripe_session_id  text    DEFAULT NULL,
  amount_paid        numeric DEFAULT 0,
  write_ledger       boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_balance integer;
  v_role text;
BEGIN
  IF add_credits.amount IS NULL OR add_credits.amount < 0 THEN
    RAISE EXCEPTION 'add_credits: amount must be >= 0 (got %)', add_credits.amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- auth.role() is NULL on a direct database connection (psql, migrations),
  -- which is already fully privileged; the guard only applies to API callers.
  v_role := auth.role();
  IF v_role IS NOT NULL
     AND v_role <> 'service_role'
     AND auth.uid() IS DISTINCT FROM add_credits.user_id THEN
    RAISE EXCEPTION 'add_credits: cannot add credits for another user'
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

  -- The record of the grant, in the same transaction as the grant.
  --
  -- A zero-amount call moves nothing and earns no row. When stripe_session_id is
  -- supplied, the unique indexes on it make this insert the idempotency guard:
  -- a redelivered event raises unique_violation here and takes the balance
  -- change down with it, which is what "atomic" buys over insert-then-grant.
  IF add_credits.write_ledger AND add_credits.amount > 0 THEN
    INSERT INTO public.points_transactions (
      user_id, action_type, points_amount, description, stripe_session_id, amount_paid, created_at
    )
    VALUES (
      add_credits.user_id,
      COALESCE(NULLIF(btrim(add_credits.action_type), ''), 'earn'),
      add_credits.amount,
      COALESCE(NULLIF(btrim(add_credits.reason), ''), 'Credits added'),
      add_credits.stripe_session_id,
      COALESCE(add_credits.amount_paid, 0),
      now()
    );
  END IF;

  RETURN v_new_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text, text, text, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text, text, text, numeric, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text, text, numeric, boolean) TO service_role;

COMMENT ON FUNCTION public.add_credits(uuid, integer, text, text, text, numeric, boolean) IS
  'Atomically grants credits AND writes the points_transactions row for the grant, mirroring deduct_credits (#137). Pass write_ledger => false only when the caller writes its own row first as an idempotency claim (the Stripe webhook). Supplying stripe_session_id makes the row an atomic idempotency guard. EXECUTE is service_role only.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Two corrections to the credit RPCs, both found by adversarially auditing the
-- migration that introduced them. (#137 follow-on)
--
-- ── 1. add_credits took `amount_paid numeric` into an integer column ────────
--
-- points_transactions.amount_paid is `integer` (cents). The parameter was
-- declared `numeric`, so a fractional value was accepted and silently ROUNDED on
-- insert. Demonstrated against the live database:
--
--   add_credits(..., amount_paid => 12.7)  ->  points_transactions.amount_paid = 13
--
-- Latent rather than live — the only caller passing it is cron/auto-buy, with
-- Stripe's integer cents — but silently rounding money is the kind of defect that
-- surfaces as an unexplainable few-cents discrepancy months later. `integer`
-- makes a fractional value a hard error at the call instead.
--
-- ── 2. deduct_credits had no write_ledger, and add_credits did ─────────────
--
-- The Stripe webhook writes its ledger row BEFORE granting, because the unique
-- indexes on stripe_session_id are what make a redelivered event idempotent.
-- add_credits supports that with write_ledger => false. deduct_credits has no
-- such escape, so the first debit path that needs a pre-written guard row has
-- exactly one option: hand-insert alongside the RPC — which is an automatic
-- double count, and the ledger is now what every points figure in the app reads.
--
-- Nothing needs it today. It exists so that the day something does, the correct
-- move is available and obvious rather than the wrong one being the only one.
-- Default true, so all existing callers are unaffected.
--
-- ── The PUBLIC trap, third time ────────────────────────────────────────────
--
-- Both signatures change, so both are DROP + CREATE, so both re-acquire an
-- automatic EXECUTE grant to PUBLIC. Revoking from `authenticated` alone does not
-- close it. The REVOKE FROM PUBLIC lines are load bearing — see commit 2ec7ec1
-- for what happens when they are missed.
--
-- Prior grants on both, from information_schema.routine_privileges:
--   postgres EXECUTE, service_role EXECUTE. Nothing else. Restored below.

BEGIN;

DROP FUNCTION IF EXISTS public.add_credits(uuid, integer, text, text, text, numeric, boolean);

CREATE OR REPLACE FUNCTION public.add_credits(
  user_id            uuid,
  amount             integer,
  reason             text    DEFAULT NULL,
  action_type        text    DEFAULT 'earn',
  stripe_session_id  text    DEFAULT NULL,
  -- integer, matching points_transactions.amount_paid. Cents, never dollars.
  amount_paid        integer DEFAULT 0,
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

DROP FUNCTION IF EXISTS public.deduct_credits(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.deduct_credits(
  user_id       uuid,
  amount        integer,
  reason        text    DEFAULT NULL,
  -- Symmetry with add_credits. Pass false ONLY when the caller writes its own
  -- row first as an idempotency claim; otherwise the charge goes unrecorded.
  write_ledger  boolean DEFAULT true
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
  IF deduct_credits.amount IS NULL OR deduct_credits.amount < 0 THEN
    RAISE EXCEPTION 'deduct_credits: amount must be >= 0 (got %)', deduct_credits.amount
      USING ERRCODE = 'check_violation';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deduct_credits: insufficient credits or unknown user %', deduct_credits.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF deduct_credits.write_ledger AND deduct_credits.amount > 0 THEN
    INSERT INTO public.points_transactions (user_id, action_type, points_amount, description, created_at)
    VALUES (
      deduct_credits.user_id,
      'spend',
      -deduct_credits.amount,
      COALESCE(NULLIF(btrim(deduct_credits.reason), ''), 'Credits deducted'),
      now()
    );
  END IF;

  RETURN v_new_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text, text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text, text, text, integer, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, boolean) TO service_role;

COMMENT ON FUNCTION public.add_credits(uuid, integer, text, text, text, integer, boolean) IS
  'Atomically grants credits AND writes the points_transactions row, mirroring deduct_credits (#137). amount_paid is cents, integer, matching the column. Pass write_ledger => false only when the caller writes its own row first as an idempotency claim (the Stripe webhook). EXECUTE is service_role only.';

COMMENT ON FUNCTION public.deduct_credits(uuid, integer, text, boolean) IS
  'Atomically charges credits AND writes the points_transactions row (#137). Pass write_ledger => false only when the caller writes its own row first as an idempotency claim; nothing does today. EXECUTE is service_role only.';

COMMIT;

NOTIFY pgrst, 'reload schema';

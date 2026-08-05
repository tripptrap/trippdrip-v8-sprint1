-- Make deduct_credits record the charge it makes. (#137)
--
-- ── Why every points number in the app was wrong ─────────────────────────────
--
-- deduct_credits moved the balance and wrote no history. Twelve call sites use
-- it — the receptionist AI, every cron, campaign runs, drips, bulk sends — so
-- the majority of all spending left no trace at all. The consequence, measured
-- on 2026-08-04: points_transactions summed to +2600 against a live balance of
-- 59,568. The ledger could not reconcile to the balance in either direction, so
-- no screen reading it could be right, and "how did I use over 300 points?" had
-- no answer anywhere in the system.
--
-- The charge and its record now happen in ONE function, which means one
-- transaction: a ledger row cannot fail to be written for a charge that went
-- through, and a failed ledger write rolls the charge back. That is the only
-- arrangement where the two can never disagree. Callers that write their own row
-- must stop doing so or they will double-count.
--
-- ── Why the signature changes ────────────────────────────────────────────────
--
-- `reason` is added so the row says something useful ("Receptionist AI reply")
-- rather than a wall of identical entries. It defaults to NULL, so all twelve
-- existing 2-argument callers keep working untouched and get a generic
-- description.
--
-- A DEFAULT cannot be added in place: CREATE OR REPLACE with a different
-- argument count creates a second overload rather than replacing the first, and
-- then a 2-argument call matches BOTH and Postgres refuses it as ambiguous. So
-- the old signature is dropped first, in this same transaction.
--
-- ── The PUBLIC trap ─────────────────────────────────────────────────────────
--
-- A newly created function grants EXECUTE to PUBLIC automatically. Dropping and
-- recreating therefore silently re-opens whatever was revoked before — and this
-- codebase has already shipped a cross-tenant hole of exactly that shape (see
-- commit 2ec7ec1). Revoking from `authenticated` alone does NOT close it,
-- because PUBLIC includes every role. The REVOKE FROM PUBLIC below is load
-- bearing; do not remove it, and re-apply it after any future recreate.
--
-- Pre-change grants, read from information_schema.routine_privileges:
--   service_role EXECUTE, postgres EXECUTE.  authenticated: none (verified by
--   calling it with an anon-key client — "permission denied for function").
-- They are restored exactly at the bottom.

BEGIN;

DROP FUNCTION IF EXISTS public.deduct_credits(uuid, integer);

CREATE OR REPLACE FUNCTION public.deduct_credits(
  user_id uuid,
  amount  integer,
  reason  text DEFAULT NULL
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

  -- The record of the charge, in the same transaction as the charge itself.
  --
  -- A zero-amount call is a no-op probe (used to test EXECUTE permission) and
  -- would otherwise litter the ledger with meaningless rows, so it is skipped —
  -- the balance did not move either.
  --
  -- action_type is free text here: points_transactions has no CHECK on it, and
  -- the values already in use are spend / earn / purchase / subscription.
  IF deduct_credits.amount > 0 THEN
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

-- Restore the exact grant set the old signature had. REVOKE FROM PUBLIC first —
-- see the note above; without it this recreate hands EXECUTE to every role.
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text) TO service_role;

COMMENT ON FUNCTION public.deduct_credits(uuid, integer, text) IS
  'Atomically charges credits AND writes the points_transactions row for the charge, so the ledger can never disagree with the balance (#137). Callers must not write their own ledger row. EXECUTE is service_role only.';

COMMIT;

-- PostgREST caches the schema, including function signatures; without this the
-- new third argument is invisible and callers passing `reason` get told the
-- function does not exist.
NOTIFY pgrst, 'reload schema';

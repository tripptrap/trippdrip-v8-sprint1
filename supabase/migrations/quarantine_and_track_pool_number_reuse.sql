-- Quarantine released pool numbers and keep their assignment history (#38).
--
-- Two paths return a toll-free pool number to the shared pool
-- (`telnyx/release-number` and `user/delete-account`). Both just cleared
-- `is_assigned`, making the number immediately claimable by the next, unrelated
-- client business.
--
-- Compliance is fine — the approved TFV declares a 1:1 ISV model and reuse is
-- sequential, never concurrent. The problem is **sender reputation, which
-- attaches to the number, not the tenant**. If business A collects spam
-- complaints or gets filtered, business B inherits all of it the moment it
-- claims the number, and experiences it as "HyveWyre's SMS doesn't work" with
-- nothing in the product able to explain why. With three numbers in the pool,
-- recycling is the normal case rather than a corner one.
--
-- This implements options 1 and 3 from the issue: a cooldown before reuse plus
-- a durable record of who held a number and what state it was in when they let
-- it go. Option 2 (retire and re-order) was not taken — it needs fresh TFV per
-- replacement (#3) and would empty a three-number pool.

ALTER TABLE public.number_pool
  ADD COLUMN IF NOT EXISTS quarantined_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_released_at  timestamptz,
  ADD COLUMN IF NOT EXISTS times_assigned    integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.number_pool.quarantined_until IS
  'Set when a number is released. Until it passes, the number is not offered to a new business — carrier reputation follows the number, not the tenant (#38). Not a hard block: if every number is quarantined the claim path will still hand one out rather than break onboarding, and alerts instead.';

CREATE INDEX IF NOT EXISTS idx_number_pool_claimable
  ON public.number_pool (is_assigned, is_verified, quarantined_until);

/**
 * Who held which number, when, and what shape it was in when they released it.
 *
 * Without this, "why is delivery bad for this tenant" is unanswerable after the
 * fact: the pool row only ever shows the *current* holder, so a number's history
 * was destroyed on every release.
 */
CREATE TABLE IF NOT EXISTS public.number_pool_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number   text NOT NULL,
  user_id        uuid,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz,
  release_reason text,
  -- Telnyx health at release: message_count, spam_ratio, success_ratio,
  -- inbound_outbound_ratio. Captured at the moment of release because it is not
  -- recoverable later — the metrics move on with the number's next holder.
  health_at_release jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- user_id is intentionally NOT a foreign key: the account-deletion path releases
-- numbers, and the whole point of this table is to still answer "who had this
-- number" after that account is gone. A CASCADE would delete exactly the rows
-- worth keeping, and a RESTRICT would block deletion.
COMMENT ON COLUMN public.number_pool_assignments.user_id IS
  'No FK on purpose — this record has to outlive the account (#38, and the retention reasoning in #87/#93).';

CREATE INDEX IF NOT EXISTS idx_pool_assignments_phone
  ON public.number_pool_assignments (phone_number, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_assignments_open
  ON public.number_pool_assignments (phone_number) WHERE released_at IS NULL;

-- Operator history, never read through PostgREST by end users.
ALTER TABLE public.number_pool_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.number_pool_assignments FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.number_pool_assignments IS
  'Assignment history for shared pool numbers (#38). One row per tenancy; released_at NULL means currently held. Answers "who had this number before, and was it already in trouble when they gave it back".';

/**
 * Close the open assignment for a number and start its cooldown.
 *
 * Both release paths do the same three things — close the history row, stamp
 * the quarantine, clear the assignment — and doing that as three separate
 * supabase-js calls in two different routes is how they drift apart. One RPC,
 * one transaction.
 */
CREATE OR REPLACE FUNCTION public.release_pool_number(
  p_phone_number text,
  p_user_id uuid,
  p_reason text DEFAULT 'released',
  p_quarantine_days integer DEFAULT 30,
  p_health jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pool_id uuid;
  v_until   timestamptz;
BEGIN
  -- Scoped to the caller's own assignment. The route this replaced filtered on
  -- assigned_to_user_id for exactly this reason: `phoneNumber` arrives in the
  -- request body, so without the ownership check a caller could name someone
  -- else's number and release it out from under them. p_user_id NULL is only
  -- for administrative release paths that have already resolved ownership.
  SELECT id INTO v_pool_id
  FROM public.number_pool
  WHERE phone_number = release_pool_number.p_phone_number
    AND (release_pool_number.p_user_id IS NULL
         OR assigned_to_user_id = release_pool_number.p_user_id);

  -- Either not a pool number (users also own numbers they bought themselves) or
  -- not this user's to release. Neither is an error worth failing the request
  -- over, and the two are deliberately indistinguishable to the caller.
  IF v_pool_id IS NULL THEN
    RETURN jsonb_build_object('pool_number', false);
  END IF;

  v_until := now() + make_interval(days => p_quarantine_days);

  UPDATE public.number_pool_assignments
     SET released_at = now(),
         release_reason = release_pool_number.p_reason,
         health_at_release = release_pool_number.p_health
   WHERE phone_number = release_pool_number.p_phone_number
     AND released_at IS NULL;

  UPDATE public.number_pool
     SET is_assigned = false,
         assigned_to_user_id = NULL,
         assigned_at = NULL,
         last_released_at = now(),
         quarantined_until = v_until,
         updated_at = now()
   WHERE id = v_pool_id;

  RETURN jsonb_build_object('pool_number', true, 'quarantined_until', v_until);
END;
$$;

COMMENT ON FUNCTION public.release_pool_number(text, uuid, text, integer, jsonb) IS
  'Closes the assignment history row and starts the reuse cooldown for a shared pool number (#38). Use instead of clearing is_assigned by hand.';

REVOKE ALL ON FUNCTION public.release_pool_number(text, uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pool_number(text, uuid, text, integer, jsonb) TO service_role;

/** Opens a history row when a number is claimed. */
CREATE OR REPLACE FUNCTION public.record_pool_assignment(
  p_phone_number text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defensive: a previous release that failed halfway would leave an open row,
  -- and two open rows for one number makes the history ambiguous.
  UPDATE public.number_pool_assignments
     SET released_at = now(), release_reason = 'closed_on_reassign'
   WHERE phone_number = record_pool_assignment.p_phone_number
     AND released_at IS NULL;

  INSERT INTO public.number_pool_assignments (phone_number, user_id)
  VALUES (record_pool_assignment.p_phone_number, record_pool_assignment.p_user_id);

  UPDATE public.number_pool
     SET times_assigned = COALESCE(times_assigned, 0) + 1
   WHERE phone_number = record_pool_assignment.p_phone_number;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pool_assignment(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pool_assignment(text, uuid) TO service_role;

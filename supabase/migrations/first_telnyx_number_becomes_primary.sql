-- A user's first phone number must become their primary one (#104).
--
-- `user_telnyx_numbers.is_primary` defaults to false, no trigger set it, and
-- **not one of the four insert paths set it** — telnyx/purchase-number,
-- number-pool/claim, number-pool/purchase-with-credits and
-- telnyx/number-order-webhook all insert without it.
--
-- Meanwhile eight code paths select `.eq('is_primary', true)`: bulk scheduling,
-- AI drip start, SMS alerts, draft replies, the 10DLC status and assign-number
-- routes, and more. They found nothing, so a brand-new user who finished
-- onboarding and received their free number **could not send at all**. The
-- number was there; the flag that makes it usable never was.
--
-- Fixed with a trigger rather than by patching the four routes: a fifth insert
-- path added later would forget in exactly the same way, and this invariant is
-- the database's to hold. The routes need no change.

CREATE OR REPLACE FUNCTION public.ensure_primary_telnyx_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only ever promotes; never demotes an explicit is_primary = true.
  IF NEW.is_primary IS DISTINCT FROM true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_telnyx_numbers
       WHERE user_id = NEW.user_id AND is_primary IS true
    ) THEN
      NEW.is_primary := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_first_number_is_primary ON public.user_telnyx_numbers;
CREATE TRIGGER trg_first_number_is_primary
  BEFORE INSERT ON public.user_telnyx_numbers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_primary_telnyx_number();

COMMENT ON FUNCTION public.ensure_primary_telnyx_number() IS
  'Makes a user''s first phone number their primary one (#104). Insert paths do not set is_primary and eight read paths require it, so without this a new user has a number they cannot send from.';

-- At most one primary per user. Several read paths use .single() on
-- is_primary = true, which errors on two rows — better to refuse the second
-- write than to leave a state those queries cannot handle.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_telnyx_numbers_one_primary
  ON public.user_telnyx_numbers (user_id)
  WHERE is_primary IS true;

-- Backfill: any user holding numbers but no primary gets their oldest one.
-- Oldest rather than newest so the number a user has been giving out stays the
-- one they send from.
WITH promote AS (
  SELECT DISTINCT ON (user_id) id
    FROM public.user_telnyx_numbers
   WHERE user_id NOT IN (
     SELECT user_id FROM public.user_telnyx_numbers WHERE is_primary IS true
   )
   ORDER BY user_id, created_at NULLS LAST, phone_number
)
UPDATE public.user_telnyx_numbers t
   SET is_primary = true, updated_at = now()
  FROM promote p
 WHERE t.id = p.id;

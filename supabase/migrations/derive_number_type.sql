-- `number_type` is derived from the number, never supplied (#129).
--
-- ── The problem ─────────────────────────────────────────────────────────────
--
-- `user_telnyx_numbers.number_type` defaults to 'local' and **no route ever
-- writes it**. Five paths insert into this table — pool claim, pool purchase,
-- direct purchase, the number-order webhook and the Stripe webhook — and every
-- one of them lets the default stand. So a toll-free number is recorded as
-- local:
--
--     +18134972176  local     (correct)
--     +18135187997  local     (correct)
--     +18887062631  local     <- an 888 number
--
-- That blocks the whole starter-number model in #129. "Ghost the toll-free once
-- a local number is active" cannot be implemented while the column cannot tell
-- them apart, and `app/api/telnyx/tollfree-status` already works around it with
-- `number_type = 'tollfree' OR isTollFreeNumber(phone_number)`.
--
-- ── Why a trigger rather than fixing five routes ────────────────────────────
--
-- Fixing the five is the obvious move and it is the weaker one: it leaves a
-- sixth free to forget, and this codebase has been bitten by exactly that shape
-- repeatedly — rate limits, geo-routing, content moderation and the opt-out
-- footer each shipped covering only the paths someone happened to be looking at.
--
-- The type is a *function of the number*. There is no case where a caller knows
-- better, so nothing should be able to supply it. Deriving it here makes every
-- existing path correct and every future one correct without anyone knowing this
-- rule exists.
--
-- Prefixes match TOLL_FREE_PREFIXES in lib/telnyx.ts. Keep them in step.

CREATE OR REPLACE FUNCTION public.set_number_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Compared against the normalised form so a number stored as (888) 706-2631
  -- classifies the same as +18887062631.
  NEW.number_type := CASE
    WHEN public.normalize_phone(NEW.phone_number) ~ '^\+1(800|833|844|855|866|877|888)'
      THEN 'tollfree'
    ELSE 'local'
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_number_type() IS
  'Derives number_type from the phone number. It is a function of the number, so no caller supplies it (#129).';

DROP TRIGGER IF EXISTS trg_set_number_type ON public.user_telnyx_numbers;
CREATE TRIGGER trg_set_number_type
  BEFORE INSERT OR UPDATE OF phone_number ON public.user_telnyx_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_number_type();

-- The pool has the same column and gets it right today, but only because the
-- one code path that writes it happens to. Same reasoning applies.
DROP TRIGGER IF EXISTS trg_set_number_type_pool ON public.number_pool;
CREATE TRIGGER trg_set_number_type_pool
  BEFORE INSERT OR UPDATE OF phone_number ON public.number_pool
  FOR EACH ROW EXECUTE FUNCTION public.set_number_type();

-- Correct what is already stored.
UPDATE public.user_telnyx_numbers
   SET number_type = CASE
     WHEN public.normalize_phone(phone_number) ~ '^\+1(800|833|844|855|866|877|888)'
       THEN 'tollfree' ELSE 'local' END
 WHERE number_type IS DISTINCT FROM (CASE
     WHEN public.normalize_phone(phone_number) ~ '^\+1(800|833|844|855|866|877|888)'
       THEN 'tollfree' ELSE 'local' END);

UPDATE public.number_pool
   SET number_type = CASE
     WHEN public.normalize_phone(phone_number) ~ '^\+1(800|833|844|855|866|877|888)'
       THEN 'tollfree' ELSE 'local' END
 WHERE number_type IS DISTINCT FROM (CASE
     WHEN public.normalize_phone(phone_number) ~ '^\+1(800|833|844|855|866|877|888)'
       THEN 'tollfree' ELSE 'local' END);

COMMENT ON COLUMN public.user_telnyx_numbers.number_type IS
  'tollfree | local. Derived by trigger from the phone number — do not set it in application code (#129).';

-- `unverified` as a brand status in its own right.
--
-- TCR's UNVERIFIED means "we could not match this business identity". It was
-- being folded into `pending` by mapBrandStatus's fallback, which made it
-- indistinguishable from "waiting on TCR" — so the campaign never filed, the
-- cron polled forever, and the user was told to expect it in "a few days"
-- (#190).
--
-- It carries two different remedies depending on entity type, which is why the
-- status alone is not enough to act on:
--   SOLE_PROPRIETOR — expected. Clears once the user completes the manual OTP.
--   everything else — TCR could not match the name/EIN against IRS records.
--                     Needs IRS propagation, external vetting, or a new brand,
--                     since companyName and ein are immutable once registered.
ALTER TABLE public.user_10dlc_registrations
  DROP CONSTRAINT IF EXISTS user_10dlc_registrations_brand_status_check;

ALTER TABLE public.user_10dlc_registrations
  ADD CONSTRAINT user_10dlc_registrations_brand_status_check
  CHECK (brand_status = ANY (ARRAY[
    'not_started'::text, 'pending'::text, 'unverified'::text, 'verified'::text, 'failed'::text
  ]));

COMMENT ON COLUMN public.user_10dlc_registrations.brand_status IS
  'not_started | pending (awaiting TCR) | unverified (TCR could not match; remedy depends on entity_type) | verified | failed';

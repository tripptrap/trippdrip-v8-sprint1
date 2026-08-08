-- Fields a SOLE_PROPRIETOR 10DLC brand needs, and the state its manual OTP step
-- lives in.
--
-- TCR matches a sole proprietor against a PERSON, so the brand carries the
-- individual's name and a mobile number that can receive the verification PIN.
-- These are the only entity type that stores them: PRIVATE_PROFIT accepts
-- firstName/lastName, echoes them back, and silently discards them (#193).
--
-- otp_requested_at records that the user has emailed 10dlcquestions@telnyx.com
-- for their PIN. Telnyx gives 24 hours to reply once it is sent, so the clock is
-- worth showing rather than leaving someone to discover it expired.
ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
  ADD COLUMN IF NOT EXISTS otp_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_10dlc_registrations.mobile_phone IS
  'Mobile that receives the TCR sole-proprietor OTP. Must be able to receive SMS — a landline silently ends the registration.';
COMMENT ON COLUMN public.user_10dlc_registrations.otp_requested_at IS
  'When the user told us they emailed Telnyx for their OTP PIN. Telnyx allows 24 hours to reply once the PIN is sent.';

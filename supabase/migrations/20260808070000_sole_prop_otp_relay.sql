-- Automating the sole-proprietor OTP exchange with Telnyx.
--
-- Telnyx verify a SOLE_PROPRIETOR brand by texting a PIN to the person's mobile
-- and taking it back by email, within 24 hours. There is no endpoint for any of
-- it (#194) — 2faEmail, otp, verification and revet all 404 — so the platform
-- does it by email on the customer's behalf.
--
-- otp_request_message_id is what makes the second email a reply rather than a new
-- thread. We send the request, so we know its Message-ID, and can set In-Reply-To
-- on the PIN without knowing Telnyx's own threading convention.
--
-- otp_consent_at is separate from the upload. Uploading a tax document to your
-- own account and having it forwarded to a third party are different acts, and
-- only the second needs saying yes to.
ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS tcr_brand_id TEXT,
  ADD COLUMN IF NOT EXISTS otp_request_message_id TEXT,
  ADD COLUMN IF NOT EXISTS otp_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_pin_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_10dlc_registrations.otp_consent_at IS
  'When the user agreed we may send their IRS CP 575 to Telnyx. Not implied by uploading it.';
COMMENT ON COLUMN public.user_10dlc_registrations.otp_request_message_id IS
  'Message-ID of our PIN request, so the PIN reply threads correctly.';

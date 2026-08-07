-- Supporting document for a 10DLC registration (typically the IRS CP 575 EIN
-- assignment notice).
--
-- Telnyx's brand API has no document field, so this is never uploaded to a
-- carrier automatically. It exists because an UNVERIFIED brand is resolved by a
-- human — Telnyx support, or a paid external vetting submission — and the first
-- thing either asks for is proof of the EIN-to-legal-name pairing. Without this
-- the user has to go find the letter again, months after signup.
--
-- Stores a path into the private `documents` bucket, never the file itself and
-- never its contents.
ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS ein_document_path TEXT,
  ADD COLUMN IF NOT EXISTS ein_document_name TEXT,
  ADD COLUMN IF NOT EXISTS ein_document_uploaded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_10dlc_registrations.ein_document_path IS
  'Path in the private `documents` storage bucket. Not sent to Telnyx — their brand API has no document field. Used for support escalation and external vetting.';

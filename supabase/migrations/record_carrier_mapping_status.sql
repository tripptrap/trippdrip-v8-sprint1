-- "Assigned to a campaign" is not the same as "works on every carrier".
--
-- Found 2026-08-04, immediately after Telnyx cleared the #105 assignment block.
-- GET /10dlc/phone_number_campaigns/<number> returns per-carrier mapping:
--
--   +18134972176  assignmentStatus ASSIGNED  att FAILED  tmobile ADDED  other ADDED
--   +18135187997  assignmentStatus ASSIGNED  att FAILED  tmobile ADDED  other ADDED
--
-- The second has been ASSIGNED since 2026-07-31 and is the number every new
-- conversation was routed to after ac9cbbd. Its AT&T mapping has been FAILED the
-- whole time, and nothing recorded or showed that -- messaging_campaign_id was
-- non-null, so isRegistered() said yes.
--
-- AT&T is roughly a third of US mobile subscribers. A number that is registered
-- for T-Mobile and everyone else but not AT&T does not fail loudly; it just
-- quietly loses a third of its traffic to filtering, which looks exactly like
-- "some people never replied".
--
-- Stored per carrier rather than collapsed, because the remedy differs by
-- carrier and because a partial mapping is a real, common state that the binary
-- registered/unregistered model could not express.

ALTER TABLE public.user_telnyx_numbers
  ADD COLUMN IF NOT EXISTS att_mapping_status TEXT,
  ADD COLUMN IF NOT EXISTS tmobile_mapping_status TEXT,
  ADD COLUMN IF NOT EXISTS other_carrier_mapping_status TEXT;

COMMENT ON COLUMN public.user_telnyx_numbers.att_mapping_status IS
  'Telnyx attNumberMappingStatus: ADDED | FAILED | PENDING. FAILED means AT&T traffic is not campaign-covered.';
COMMENT ON COLUMN public.user_telnyx_numbers.tmobile_mapping_status IS
  'Telnyx tmobileNumberMappingStatus.';
COMMENT ON COLUMN public.user_telnyx_numbers.other_carrier_mapping_status IS
  'Telnyx nonTmobileNumberMappingStatus — Verizon and the rest.';

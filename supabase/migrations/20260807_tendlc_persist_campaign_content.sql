-- Persist campaign content so it can be submitted after the brand verifies (#1).
-- APPLIED 2026-08-07 against the linked project.
--
-- /api/telnyx/10dlc/register created the brand and then immediately created the
-- campaign in the same request. Telnyx refuses that: a brand-new brand starts
-- PENDING and "Cannot associate campaign with brand in pending or failed status".
--
-- So per-agent registration failed for EVERY genuinely new agent — the user pays
-- the $4.50 brand fee and receives a 502 with a half-finished registration. It
-- only ever appeared to work for HyveWyre's own filing, whose brand had been
-- created separately and was already VERIFIED by the time a campaign was tried.
--
-- Found by the first end-to-end run of the flow, in mock mode, at no cost.
--
-- The campaign is therefore submitted later, by /api/cron/refresh-10dlc, once the
-- brand reaches verified. That needs the content generated at registration —
-- including what_they_offer and any operator overrides, neither of which the row
-- stored. Regenerating instead would silently file something different from what
-- the user reviewed, and campaign-content accuracy is what caused the original
-- rejection.

ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS what_they_offer text,
  ADD COLUMN IF NOT EXISTS campaign_content jsonb,
  ADD COLUMN IF NOT EXISTS pending_campaign_usecase text;

COMMENT ON COLUMN public.user_10dlc_registrations.campaign_content IS
  'Resolved campaign content captured at registration, so the campaign can be submitted once the brand verifies without regenerating (#1).';

NOTIFY pgrst, 'reload schema';

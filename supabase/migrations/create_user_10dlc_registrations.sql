-- =============================================================
-- Per-agent 10DLC brand + campaign registration tracking
--
-- Telnyx requires every end-client of an ISV platform to register
-- its own 10DLC brand and campaign (no shared platform-level brand
-- is allowed). This table tracks that per-user registration and its
-- lifecycle: not_started -> brand_pending -> campaign_pending -> active,
-- with failure states at each stage.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_10dlc_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Brand registration inputs (collected during onboarding)
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PRIVATE_PROFIT', 'PUBLIC_PROFIT', 'NON_PROFIT', 'GOVERNMENT', 'SOLE_PROPRIETOR')),
  legal_business_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tax_id TEXT, -- EIN for standard entities; null for SOLE_PROPRIETOR (Telnyx uses SSN + OTP verification instead)
  contact_phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website TEXT,
  vertical TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',

  -- Telnyx brand state
  brand_id TEXT,
  brand_status TEXT NOT NULL DEFAULT 'not_started' CHECK (brand_status IN ('not_started', 'pending', 'verified', 'failed')),
  brand_failure_reason TEXT,

  -- Telnyx campaign state
  campaign_id TEXT,
  campaign_use_case TEXT CHECK (campaign_use_case IN ('LOW_VOLUME', 'MIXED')),
  campaign_status TEXT NOT NULL DEFAULT 'not_started' CHECK (campaign_status IN ('not_started', 'pending', 'active', 'failed')),
  campaign_failure_reason TEXT,

  -- Number linkage — the phone_number currently assigned to this campaign
  assigned_phone_number TEXT,

  -- Set true for Telnyx mock brands/campaigns used in integration testing.
  -- Mock registrations must never be treated as real 10DLC coverage.
  is_mock BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_10dlc_registrations_user_id ON public.user_10dlc_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_10dlc_registrations_campaign_status ON public.user_10dlc_registrations(campaign_status);

ALTER TABLE public.user_10dlc_registrations ENABLE ROW LEVEL SECURITY;

-- Users can view their own registration status (read-only — the
-- registration itself is always driven server-side against the Telnyx API).
CREATE POLICY "Users can view their own 10DLC registration"
  ON public.user_10dlc_registrations FOR SELECT
  USING (auth.uid() = user_id);

-- All writes happen via server-side code using the service role key.
CREATE POLICY "Service role can manage all 10DLC registrations"
  ON public.user_10dlc_registrations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.user_10dlc_registrations IS 'Per-agent Telnyx 10DLC brand + campaign registration, required since Telnyx does not allow a single shared brand across an ISV platform''s end-clients.';

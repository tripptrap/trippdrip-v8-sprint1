-- Add identity JSONB column to receptionist_settings
-- Stores structured identity info: agent name, business name, what they offer, etc.
-- This powers the AI's ability to answer "who are you?" / "who do you work for?" questions

ALTER TABLE receptionist_settings
  ADD COLUMN IF NOT EXISTS identity JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN receptionist_settings.identity IS
  'Structured identity: agentName, businessName, whatYouOffer, targetAudience, serviceArea, callbackPhone, website, tagline';

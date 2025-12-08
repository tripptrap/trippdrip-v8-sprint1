-- ============================================================
-- HyveWyre - Calendar Integration & AI Settings Migration
-- ============================================================
-- Run this entire script in Supabase SQL Editor
-- This sets up Google Calendar integration and AI model settings
-- ============================================================

-- ============================================================
-- 1. Add Google Calendar columns to users table
-- ============================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_calendar_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_token_expiry TIMESTAMPTZ;

COMMENT ON COLUMN users.google_calendar_access_token IS 'Google Calendar OAuth access token';
COMMENT ON COLUMN users.google_calendar_refresh_token IS 'Google Calendar OAuth refresh token (long-lived)';
COMMENT ON COLUMN users.google_calendar_token_expiry IS 'When the access token expires';

-- Create index for faster lookups of users with calendar connected
CREATE INDEX IF NOT EXISTS idx_users_google_calendar_connected
ON users(google_calendar_refresh_token)
WHERE google_calendar_refresh_token IS NOT NULL;

-- ============================================================
-- 2. Create calendar_events table
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  attendee_email TEXT,
  attendee_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead_id ON calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id ON calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- Enable Row Level Security
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_events
DROP POLICY IF EXISTS "Users can view their own calendar events" ON calendar_events;
CREATE POLICY "Users can view their own calendar events"
  ON calendar_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own calendar events" ON calendar_events;
CREATE POLICY "Users can insert their own calendar events"
  ON calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own calendar events" ON calendar_events;
CREATE POLICY "Users can update their own calendar events"
  ON calendar_events FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own calendar events" ON calendar_events;
CREATE POLICY "Users can delete their own calendar events"
  ON calendar_events FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE calendar_events IS 'Stores Google Calendar events created through the app';

-- ============================================================
-- 3. Create user_settings table for AI settings
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

  -- AI Model Settings
  ai_settings JSONB DEFAULT '{
    "modelVersion": "v1",
    "v2CustomPrompt": "",
    "v2ModelSettings": {
      "temperature": 0.7,
      "maxTokens": 150,
      "presencePenalty": 0.0,
      "frequencyPenalty": 0.0
    }
  }'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON user_settings;
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON user_settings;
CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings" ON user_settings;
CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own settings" ON user_settings;
CREATE POLICY "Users can delete their own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

COMMENT ON TABLE user_settings IS 'User-specific settings including AI configuration';
COMMENT ON COLUMN user_settings.ai_settings IS 'JSONB containing AI model settings (version, prompts, model params)';

-- ============================================================
-- 4. Add appointment tracking columns to leads table
-- ============================================================

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS appointment_scheduled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS appointment_google_event_id TEXT;

COMMENT ON COLUMN leads.appointment_scheduled IS 'Whether an appointment has been scheduled with this lead';
COMMENT ON COLUMN leads.appointment_at IS 'The scheduled appointment time';
COMMENT ON COLUMN leads.appointment_google_event_id IS 'The Google Calendar event ID for the appointment';

-- Create index for faster lookups of leads with appointments
CREATE INDEX IF NOT EXISTS idx_leads_appointment_scheduled
ON leads(appointment_scheduled)
WHERE appointment_scheduled = true;

-- ============================================================
-- Done! Calendar integration and AI settings are now ready
-- ============================================================

SELECT 'Migration completed successfully!' as status;

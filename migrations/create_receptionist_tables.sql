-- Migration: Create Receptionist Mode Tables
-- Description: Tables for AI Receptionist feature (Premium only)

-- Table: receptionist_settings
-- Stores user configuration for the AI receptionist
CREATE TABLE IF NOT EXISTS receptionist_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Enable/Disable
  enabled BOOLEAN DEFAULT false,

  -- AI Configuration
  system_prompt TEXT,
  greeting_message TEXT DEFAULT 'Hi! Thanks for reaching out. How can I help you today?',

  -- Business Hours
  business_hours_enabled BOOLEAN DEFAULT true,
  business_hours_start TIME DEFAULT '09:00:00',
  business_hours_end TIME DEFAULT '17:00:00',
  business_hours_timezone TEXT DEFAULT 'America/New_York',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 1=Mon, 7=Sun
  after_hours_message TEXT DEFAULT 'Thanks for reaching out! We''re currently closed but will get back to you during business hours.',

  -- Response Settings
  respond_to_sold_clients BOOLEAN DEFAULT true,
  respond_to_new_contacts BOOLEAN DEFAULT true,
  auto_create_leads BOOLEAN DEFAULT true,

  -- Calendar Integration
  calendar_enabled BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: receptionist_logs
-- Tracks all receptionist interactions for analytics and debugging
CREATE TABLE IF NOT EXISTS receptionist_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Contact Info
  phone_number TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('sold_client', 'new_contact', 'existing_lead')),

  -- Message Details
  inbound_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  response_type TEXT CHECK (response_type IN ('greeting', 'support', 'scheduling', 'after_hours', 'error')),

  -- Points Tracking
  points_used INTEGER DEFAULT 2,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_receptionist_settings_user_id ON receptionist_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_receptionist_settings_enabled ON receptionist_settings(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_receptionist_logs_user_id ON receptionist_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_receptionist_logs_phone ON receptionist_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_receptionist_logs_created ON receptionist_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receptionist_logs_thread ON receptionist_logs(thread_id) WHERE thread_id IS NOT NULL;

-- Row Level Security
ALTER TABLE receptionist_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE receptionist_logs ENABLE ROW LEVEL SECURITY;

-- Policies for receptionist_settings
CREATE POLICY "Users can view their own receptionist settings"
  ON receptionist_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own receptionist settings"
  ON receptionist_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own receptionist settings"
  ON receptionist_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own receptionist settings"
  ON receptionist_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for receptionist_logs
CREATE POLICY "Users can view their own receptionist logs"
  ON receptionist_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own receptionist logs"
  ON receptionist_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_receptionist_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_receptionist_settings_updated_at ON receptionist_settings;
CREATE TRIGGER trigger_receptionist_settings_updated_at
  BEFORE UPDATE ON receptionist_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_receptionist_settings_updated_at();

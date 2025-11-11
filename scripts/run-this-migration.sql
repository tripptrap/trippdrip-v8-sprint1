-- SMS Tracking Migration - Customized for your database
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. SMS MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Message details
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,

  -- Twilio details
  twilio_sid TEXT,
  twilio_status TEXT,
  twilio_error_code TEXT,
  twilio_error_message TEXT,

  -- Cost tracking
  cost_points INTEGER DEFAULT 1,

  -- Metadata
  template_id UUID,
  is_automated BOOLEAN DEFAULT false,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_id ON sms_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(twilio_status);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SMS messages"
  ON sms_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS messages"
  ON sms_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS messages"
  ON sms_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. SMS TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Template details
  name TEXT NOT NULL,
  category TEXT,
  message_body TEXT NOT NULL,

  -- Variables support
  variables TEXT[] DEFAULT '{}',

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  is_favorite BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_user_id ON sms_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(category);

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SMS templates"
  ON sms_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS templates"
  ON sms_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS templates"
  ON sms_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SMS templates"
  ON sms_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. SMS RESPONSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sms_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  original_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL,

  -- Response details
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,

  -- Twilio details
  twilio_sid TEXT,

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_responses_user_id ON sms_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_responses_lead_id ON sms_responses(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_responses_received_at ON sms_responses(received_at DESC);

ALTER TABLE sms_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SMS responses"
  ON sms_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS responses"
  ON sms_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS responses"
  ON sms_responses FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 4. UPDATE LEAD ACTIVITIES TABLE
-- ============================================

-- Add title column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_activities' AND column_name = 'title'
  ) THEN
    ALTER TABLE lead_activities ADD COLUMN title TEXT;
  END IF;
END $$;

-- Add sms_message_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_activities' AND column_name = 'sms_message_id'
  ) THEN
    ALTER TABLE lead_activities ADD COLUMN sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add sms_response_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_activities' AND column_name = 'sms_response_id'
  ) THEN
    ALTER TABLE lead_activities ADD COLUMN sms_response_id UUID REFERENCES sms_responses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 5. ADD TRIGGERS
-- ============================================

-- Trigger for sms_messages updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sms_messages_updated_at ON sms_messages;
CREATE TRIGGER update_sms_messages_updated_at
  BEFORE UPDATE ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_templates_updated_at ON sms_templates;
CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

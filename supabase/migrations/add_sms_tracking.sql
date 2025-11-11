-- SMS Tracking and Analytics Migration
-- This migration creates tables for SMS tracking, templates, and analytics

-- ============================================
-- 1. SMS MESSAGES TABLE
-- Track all sent SMS messages with delivery status
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
  twilio_status TEXT, -- queued, sending, sent, delivered, failed, undelivered
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_id ON sms_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(twilio_status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_to_phone ON sms_messages(to_phone);

-- Enable RLS
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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
-- Pre-written message templates for quick sending
-- ============================================
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Template details
  name TEXT NOT NULL,
  category TEXT, -- e.g., 'follow-up', 'appointment', 'thank-you'
  message_body TEXT NOT NULL,

  -- Variables support (e.g., {firstName}, {propertyAddress})
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_user_id ON sms_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(category);
CREATE INDEX IF NOT EXISTS idx_sms_templates_is_favorite ON sms_templates(is_favorite);

-- Enable RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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
-- Track incoming SMS responses from leads
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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sms_responses_user_id ON sms_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_responses_lead_id ON sms_responses(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_responses_from_phone ON sms_responses(from_phone);
CREATE INDEX IF NOT EXISTS idx_sms_responses_received_at ON sms_responses(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_responses_is_read ON sms_responses(is_read);

-- Enable RLS
ALTER TABLE sms_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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
-- Add SMS-related foreign keys if they don't exist
-- ============================================
DO $$
BEGIN
  -- Add sms_message_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'lead_activities'
    AND column_name = 'sms_message_id'
  ) THEN
    ALTER TABLE lead_activities ADD COLUMN sms_message_id UUID REFERENCES sms_messages(id) ON DELETE SET NULL;
  END IF;

  -- Add sms_response_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'lead_activities'
    AND column_name = 'sms_response_id'
  ) THEN
    ALTER TABLE lead_activities ADD COLUMN sms_response_id UUID REFERENCES sms_responses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 5. FUNCTIONS AND TRIGGERS
-- ============================================

-- Add trigger for sms_messages updated_at
DROP TRIGGER IF EXISTS update_sms_messages_updated_at ON sms_messages;
CREATE TRIGGER update_sms_messages_updated_at
  BEFORE UPDATE ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for sms_templates updated_at
DROP TRIGGER IF EXISTS update_sms_templates_updated_at ON sms_templates;
CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. INSERT DEFAULT SMS TEMPLATES
-- ============================================
-- Add some default templates for new users
-- These will be created when a user first accesses templates

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- SMS tracking tables created with proper RLS policies
-- Ready to track SMS messages, templates, responses, and analytics

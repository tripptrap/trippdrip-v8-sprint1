-- Create user_telnyx_numbers table for tracking Telnyx phone numbers per user
-- This allows the webhook to know which user an incoming message belongs to

CREATE TABLE IF NOT EXISTS user_telnyx_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  telnyx_connection_id TEXT,
  messaging_profile_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone_number)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_telnyx_numbers_user_id ON user_telnyx_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_telnyx_numbers_phone ON user_telnyx_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_user_telnyx_numbers_status ON user_telnyx_numbers(status);

-- Enable RLS
ALTER TABLE user_telnyx_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own Telnyx numbers"
  ON user_telnyx_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Telnyx numbers"
  ON user_telnyx_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Telnyx numbers"
  ON user_telnyx_numbers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Telnyx numbers"
  ON user_telnyx_numbers FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role to query for webhook lookups
CREATE POLICY "Service role can view all numbers"
  ON user_telnyx_numbers FOR SELECT
  USING (true);

COMMENT ON TABLE user_telnyx_numbers IS 'Telnyx phone numbers assigned to users for SMS';

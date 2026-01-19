-- Fix threads and messages schema to support SMS functionality
-- This adds missing columns that the send-sms endpoint expects

-- Add missing columns to threads table
ALTER TABLE threads ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS messages_from_user INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS messages_from_lead INTEGER DEFAULT 0;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Copy existing data if lead_phone exists but phone_number doesn't have data
UPDATE threads SET phone_number = lead_phone WHERE phone_number IS NULL AND lead_phone IS NOT NULL;
UPDATE threads SET last_message = last_message_snippet WHERE last_message IS NULL AND last_message_snippet IS NOT NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_threads_phone_number ON threads(phone_number);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);

-- Add missing columns to messages table for SMS tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_sid TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS num_media INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_urls JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'sms';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make user_id nullable in messages since API might not always have it
ALTER TABLE messages ALTER COLUMN user_id DROP NOT NULL;

-- Update direction constraint to accept both formats
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages ADD CONSTRAINT messages_direction_check
  CHECK (direction IN ('in', 'out', 'inbound', 'outbound'));

-- Update sender constraint to be more flexible
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;

-- Add index for message_sid for deduplication
CREATE INDEX IF NOT EXISTS idx_messages_message_sid ON messages(message_sid);

COMMENT ON COLUMN threads.phone_number IS 'Phone number for SMS threads';
COMMENT ON COLUMN threads.messages_from_user IS 'Count of outbound messages';
COMMENT ON COLUMN threads.messages_from_lead IS 'Count of inbound messages (replies)';
COMMENT ON COLUMN messages.message_sid IS 'External message ID from SMS provider (Telnyx)';

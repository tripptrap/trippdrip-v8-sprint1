-- Fix schema for inbound SMS messages
-- The webhook needs to insert messages/threads for inbound contacts
-- who may not have a lead record yet

-- Make lead_id nullable on messages (inbound contacts may not be leads yet)
ALTER TABLE messages ALTER COLUMN lead_id DROP NOT NULL;

-- Make lead_id nullable on threads (inbound contacts may not be leads yet)
ALTER TABLE threads ALTER COLUMN lead_id DROP NOT NULL;

-- Add from_phone and to_phone columns if they don't exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_phone TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_phone TEXT;

-- Add indexes for phone lookups
CREATE INDEX IF NOT EXISTS idx_messages_from_phone ON messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_messages_to_phone ON messages(to_phone);

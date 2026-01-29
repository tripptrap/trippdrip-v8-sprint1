-- Add body column to messages table
-- The messages table uses 'content' but the API expects 'body'

-- Option 1: Add body column and copy from content
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body TEXT;

-- Copy existing content to body
UPDATE messages SET body = content WHERE body IS NULL AND content IS NOT NULL;

-- Add index for body column
CREATE INDEX IF NOT EXISTS idx_messages_body ON messages(body);

COMMENT ON COLUMN messages.body IS 'Message body/content text';

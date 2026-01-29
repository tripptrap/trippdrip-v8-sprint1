-- AI Drip Messages Table
-- Stores pre-generated messages for each drip sequence

CREATE TABLE IF NOT EXISTS ai_drip_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drip_id UUID NOT NULL REFERENCES ai_drips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_number INTEGER NOT NULL, -- 1, 2, 3, etc.
  content TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  message_id UUID, -- Reference to messages table after sent
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding messages ready to send
CREATE INDEX IF NOT EXISTS idx_ai_drip_messages_scheduled ON ai_drip_messages(scheduled_for)
  WHERE status = 'scheduled';

-- Index for drip lookup
CREATE INDEX IF NOT EXISTS idx_ai_drip_messages_drip ON ai_drip_messages(drip_id);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_ai_drip_messages_user ON ai_drip_messages(user_id);

-- Row Level Security
ALTER TABLE ai_drip_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_drip_messages" ON ai_drip_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_drip_messages" ON ai_drip_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_drip_messages" ON ai_drip_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_drip_messages" ON ai_drip_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_drip_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_drip_messages_updated_at
  BEFORE UPDATE ON ai_drip_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_drip_messages_updated_at();

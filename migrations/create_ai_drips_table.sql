-- AI Drips Table
-- Tracks automatic AI-generated follow-up message sequences

CREATE TABLE IF NOT EXISTS ai_drips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  from_number TEXT, -- Telnyx number to send from
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'stopped', 'failed')),
  interval_hours INTEGER NOT NULL DEFAULT 6,
  max_messages INTEGER DEFAULT 5,
  messages_sent INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  next_send_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding drips ready to process
CREATE INDEX IF NOT EXISTS idx_ai_drips_next_send ON ai_drips(next_send_at) WHERE status = 'active';

-- Index for finding drips by phone number (for auto-stop on reply)
CREATE INDEX IF NOT EXISTS idx_ai_drips_phone ON ai_drips(phone_number) WHERE status = 'active';

-- Index for user's drips
CREATE INDEX IF NOT EXISTS idx_ai_drips_user ON ai_drips(user_id);

-- Index for thread lookup
CREATE INDEX IF NOT EXISTS idx_ai_drips_thread ON ai_drips(thread_id);

-- Row Level Security
ALTER TABLE ai_drips ENABLE ROW LEVEL SECURITY;

-- Users can only see their own drips
CREATE POLICY "Users can view own ai_drips" ON ai_drips
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_drips" ON ai_drips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_drips" ON ai_drips
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai_drips" ON ai_drips
  FOR DELETE USING (auth.uid() = user_id);

-- Function to get drips ready to send
CREATE OR REPLACE FUNCTION get_ai_drips_ready_to_send()
RETURNS SETOF ai_drips AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM ai_drips
  WHERE status = 'active'
    AND next_send_at <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_messages IS NULL OR messages_sent < max_messages)
  ORDER BY next_send_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to stop drip by phone number (called when reply received)
CREATE OR REPLACE FUNCTION stop_ai_drip_on_reply(p_phone TEXT)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE ai_drips
  SET status = 'completed',
      updated_at = NOW()
  WHERE phone_number = p_phone
    AND status = 'active';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_drips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_drips_updated_at
  BEFORE UPDATE ON ai_drips
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_drips_updated_at();

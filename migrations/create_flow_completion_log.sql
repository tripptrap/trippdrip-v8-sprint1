-- Migration: Create flow_completion_log table
-- Description: Track when leads complete conversation flows/drip campaigns
-- Used by: /api/cron/process-drips and /api/analytics/automation

-- Create flow_completion_log table
CREATE TABLE IF NOT EXISTS flow_completion_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
  steps_completed INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  completion_type VARCHAR(50) DEFAULT 'full', -- 'full', 'partial', 'cancelled'
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_flow_completion_log_user_id ON flow_completion_log(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_completion_log_campaign_id ON flow_completion_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_flow_completion_log_completed_at ON flow_completion_log(completed_at);

-- Enable RLS
ALTER TABLE flow_completion_log ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see their own completion logs
CREATE POLICY "Users can view own flow completion logs"
  ON flow_completion_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS policy: Users can insert their own completion logs
CREATE POLICY "Users can insert own flow completion logs"
  ON flow_completion_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access to flow completion logs"
  ON flow_completion_log
  FOR ALL
  USING (auth.role() = 'service_role');

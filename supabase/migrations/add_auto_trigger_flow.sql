-- Add auto_trigger_flow column to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_trigger_flow BOOLEAN DEFAULT false;

-- Index for webhook performance (looking up campaigns with auto-trigger enabled)
CREATE INDEX IF NOT EXISTS idx_campaigns_auto_trigger ON campaigns(user_id, auto_trigger_flow) WHERE auto_trigger_flow = true;

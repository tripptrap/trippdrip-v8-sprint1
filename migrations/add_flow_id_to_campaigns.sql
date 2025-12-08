-- Migration: Add flow_id column to campaigns table
-- This allows campaigns to be associated with a specific flow

-- Add flow_id column to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES flows(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_flow_id ON campaigns(flow_id);

-- Comment for documentation
COMMENT ON COLUMN campaigns.flow_id IS 'The flow/template associated with this campaign for automated responses';

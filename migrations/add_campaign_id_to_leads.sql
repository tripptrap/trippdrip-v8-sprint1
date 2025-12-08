-- Add campaign_id column to leads table to link leads to campaigns
-- Run this in your Supabase SQL editor

-- Add campaign_id column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);

-- Optional: If you want to enable RLS policy for campaign-based access
-- (This assumes you already have RLS enabled on the leads table)

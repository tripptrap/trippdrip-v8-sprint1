-- Add primary_tag column to leads table
-- This column stores the user's selected primary/current stage tag for a lead
-- Referenced throughout the UI and API but was missing from the schema

ALTER TABLE leads ADD COLUMN IF NOT EXISTS primary_tag TEXT DEFAULT NULL;

-- Index for filtering/querying by primary tag
CREATE INDEX IF NOT EXISTS idx_leads_primary_tag ON leads(user_id, primary_tag) WHERE primary_tag IS NOT NULL;

-- Also add to clients table for consistency (clients can have tags too)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_tag TEXT DEFAULT NULL;

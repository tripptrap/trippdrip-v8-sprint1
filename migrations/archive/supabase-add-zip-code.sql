-- Add zip_code column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_zip_code ON leads(zip_code);

-- Add comment
COMMENT ON COLUMN leads.zip_code IS 'ZIP/Postal code for lead location filtering';

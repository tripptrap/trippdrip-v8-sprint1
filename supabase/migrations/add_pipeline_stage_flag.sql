-- Add is_pipeline_stage flag to tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_pipeline_stage BOOLEAN DEFAULT false;

-- Index for fast pipeline stage queries
CREATE INDEX IF NOT EXISTS idx_tags_pipeline_stages
  ON tags(user_id, is_pipeline_stage, position)
  WHERE is_pipeline_stage = true;

-- Mark industry preset tags as pipeline stages for existing users
-- (any tag whose name matches common pipeline stage names)
UPDATE tags
SET is_pipeline_stage = true
WHERE name IN (
  'New Lead', 'Contacted', 'Qualified', 'Quoted', 'Appointment Set',
  'Showing Scheduled', 'Offer Made', 'Under Contract', 'Closed',
  'Site Survey', 'Proposal Sent', 'Contract Signed', 'Installation', 'Complete',
  'Inspection Scheduled', 'Estimate Sent', 'Approved', 'In Progress',
  'Consulted', 'Signed', 'Active', 'Follow-up', 'Active Patient',
  'Test Drive', 'Negotiating', 'Financing', 'Sold', 'Lost',
  'Interested', 'Purchased', 'Repeat Customer',
  'Proposal', 'Under Review'
);

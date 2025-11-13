-- Create number_pool table for shared pre-verified numbers
CREATE TABLE IF NOT EXISTS number_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  phone_sid TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  number_type TEXT NOT NULL CHECK (number_type IN ('local', 'tollfree')),

  -- Capabilities
  capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": true}'::jsonb,

  -- Verification status
  is_verified BOOLEAN DEFAULT false,
  verification_status TEXT DEFAULT 'pending',
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Assignment tracking
  is_assigned BOOLEAN DEFAULT false,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,

  -- Master account info
  master_account_sid TEXT NOT NULL,

  -- Metadata
  monthly_cost DECIMAL(10, 2) DEFAULT 2.00,
  purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_number_pool_assigned ON number_pool(is_assigned);
CREATE INDEX IF NOT EXISTS idx_number_pool_verified ON number_pool(is_verified);
CREATE INDEX IF NOT EXISTS idx_number_pool_user ON number_pool(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_number_pool_type ON number_pool(number_type);

-- Enable RLS
ALTER TABLE number_pool ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view numbers assigned to them
CREATE POLICY "Users can view their assigned numbers"
  ON number_pool
  FOR SELECT
  USING (assigned_to_user_id = auth.uid());

-- Policy: Users can view available unassigned numbers
CREATE POLICY "Users can view available numbers"
  ON number_pool
  FOR SELECT
  USING (is_assigned = false AND is_verified = true);

-- Policy: Service role can do everything (for admin/API)
CREATE POLICY "Service role full access"
  ON number_pool
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_number_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_number_pool_timestamp
  BEFORE UPDATE ON number_pool
  FOR EACH ROW
  EXECUTE FUNCTION update_number_pool_updated_at();

-- Insert some sample data (you'll replace these with real numbers)
-- Uncomment and update with your actual verified numbers
/*
INSERT INTO number_pool (
  phone_number,
  phone_sid,
  friendly_name,
  number_type,
  is_verified,
  verification_status,
  verified_at,
  master_account_sid,
  monthly_cost
) VALUES
  ('+18555575513', 'PN_sample_1', 'Pool Toll-Free #1', 'tollfree', true, 'approved', NOW(), 'YOUR_MASTER_SID', 2.00),
  ('+18555575514', 'PN_sample_2', 'Pool Toll-Free #2', 'tollfree', true, 'approved', NOW(), 'YOUR_MASTER_SID', 2.00),
  ('+18555575515', 'PN_sample_3', 'Pool Toll-Free #3', 'tollfree', true, 'approved', NOW(), 'YOUR_MASTER_SID', 2.00);
*/

COMMENT ON TABLE number_pool IS 'Shared pool of pre-verified phone numbers that users can claim';
COMMENT ON COLUMN number_pool.is_verified IS 'Whether the number has passed Twilio verification (A2P or toll-free)';
COMMENT ON COLUMN number_pool.is_assigned IS 'Whether this number is currently assigned to a user';
COMMENT ON COLUMN number_pool.assigned_to_user_id IS 'User ID this number is assigned to (NULL if unassigned)';

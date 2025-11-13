-- Add columns to user_twilio_numbers to track pool assignments
ALTER TABLE user_twilio_numbers
ADD COLUMN IF NOT EXISTS is_from_pool BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pool_number_id UUID REFERENCES number_pool(id) ON DELETE SET NULL;

-- Create index for pool number lookups
CREATE INDEX IF NOT EXISTS idx_user_twilio_numbers_pool ON user_twilio_numbers(pool_number_id);
CREATE INDEX IF NOT EXISTS idx_user_twilio_numbers_is_pool ON user_twilio_numbers(is_from_pool);

COMMENT ON COLUMN user_twilio_numbers.is_from_pool IS 'Whether this number is from the shared pool (true) or user-owned (false)';
COMMENT ON COLUMN user_twilio_numbers.pool_number_id IS 'Reference to number_pool table if this is a shared number';

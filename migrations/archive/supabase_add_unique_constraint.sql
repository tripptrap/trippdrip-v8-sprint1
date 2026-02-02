-- Add a column to store the Stripe session ID (if it doesn't exist)
ALTER TABLE points_transactions 
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Create a unique index to prevent duplicate processing of the same session
CREATE UNIQUE INDEX IF NOT EXISTS unique_stripe_session_idx 
ON points_transactions(user_id, stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;

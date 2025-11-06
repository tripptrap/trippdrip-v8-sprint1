-- Create payments table for tracking Stripe transactions
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL, -- 'completed', 'failed', 'demo_completed', 'pending'
  plan_type VARCHAR(50),
  credits_purchased INTEGER,
  payment_method VARCHAR(50), -- 'card', 'demo'
  pack_name VARCHAR(255),
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_session_id);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert payments"
  ON payments FOR INSERT
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE payments IS 'Stores payment transaction history for Stripe and demo payments';
COMMENT ON COLUMN payments.status IS 'Payment status: completed, failed, demo_completed, pending';
COMMENT ON COLUMN payments.amount IS 'Amount in cents (e.g., 2900 = $29.00)';

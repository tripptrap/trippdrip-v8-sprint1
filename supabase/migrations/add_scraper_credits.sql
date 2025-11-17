-- Add scraper credits system
-- Users can purchase scraping credits

-- Add scraper_credits column to user_subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS scraper_credits INTEGER DEFAULT 10;

-- Create scraper credit packages table
CREATE TABLE IF NOT EXISTS scraper_credit_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_usd DECIMAL(10,2) NOT NULL,
  savings_percent INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  stripe_price_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default packages
INSERT INTO scraper_credit_packages (name, credits, price_usd, savings_percent, display_order) VALUES
  ('Starter Pack', 100, 10.00, 0, 1),
  ('Growth Pack', 500, 40.00, 20, 2),
  ('Business Pack', 1000, 70.00, 30, 3),
  ('Enterprise Pack', 5000, 300.00, 40, 4)
ON CONFLICT DO NOTHING;

-- Create scraper credit transactions table
CREATE TABLE IF NOT EXISTS scraper_credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Transaction details
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'grant', 'monthly_renewal')),
  amount INTEGER NOT NULL, -- Positive for additions, negative for usage
  balance_after INTEGER NOT NULL,

  -- Purchase info (if type = 'purchase')
  package_id UUID REFERENCES scraper_credit_packages(id) ON DELETE SET NULL,
  price_paid DECIMAL(10,2),
  payment_intent_id TEXT,

  -- Usage info (if type = 'usage')
  scraper_run_id UUID REFERENCES scraper_runs(id) ON DELETE SET NULL,
  scraper_config_id UUID REFERENCES scraper_configs(id) ON DELETE SET NULL,

  -- Metadata
  description TEXT,
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_credit_transactions_user ON scraper_credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_scraper_credit_transactions_type ON scraper_credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_scraper_credit_transactions_created ON scraper_credit_transactions(created_at DESC);

-- RLS Policies
ALTER TABLE scraper_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit transactions"
  ON scraper_credit_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own credit transactions"
  ON scraper_credit_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Function to get user's current scraper credits
CREATE OR REPLACE FUNCTION get_user_scraper_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  credits INTEGER;
BEGIN
  SELECT scraper_credits INTO credits
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  -- If no subscription record, return 0
  RETURN COALESCE(credits, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct scraper credits
CREATE OR REPLACE FUNCTION deduct_scraper_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_scraper_run_id UUID DEFAULT NULL,
  p_scraper_config_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get current credits
  SELECT scraper_credits INTO current_credits
  FROM user_subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE; -- Lock the row

  -- Check if user has enough credits
  IF current_credits IS NULL OR current_credits < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Deduct credits
  new_balance := current_credits - p_amount;

  UPDATE user_subscriptions
  SET scraper_credits = new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO scraper_credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    scraper_run_id,
    scraper_config_id,
    description
  ) VALUES (
    p_user_id,
    'usage',
    -p_amount,
    new_balance,
    p_scraper_run_id,
    p_scraper_config_id,
    COALESCE(p_description, 'Scraper run')
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add scraper credits
CREATE OR REPLACE FUNCTION add_scraper_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'purchase',
  p_package_id UUID DEFAULT NULL,
  p_price_paid DECIMAL DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get current credits
  SELECT scraper_credits INTO current_credits
  FROM user_subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE; -- Lock the row

  -- If no subscription record, create one
  IF current_credits IS NULL THEN
    INSERT INTO user_subscriptions (user_id, scraper_credits, plan_type)
    VALUES (p_user_id, p_amount, 'basic')
    ON CONFLICT (user_id) DO UPDATE
    SET scraper_credits = user_subscriptions.scraper_credits + p_amount,
        updated_at = NOW();

    new_balance := p_amount;
  ELSE
    -- Add credits
    new_balance := current_credits + p_amount;

    UPDATE user_subscriptions
    SET scraper_credits = new_balance,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- Log transaction
  INSERT INTO scraper_credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    package_id,
    price_paid,
    payment_intent_id,
    description
  ) VALUES (
    p_user_id,
    p_type,
    p_amount,
    new_balance,
    p_package_id,
    p_price_paid,
    p_payment_intent_id,
    COALESCE(p_description, 'Credits purchased')
  );

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE scraper_credit_packages IS 'Available scraper credit packages for purchase';
COMMENT ON TABLE scraper_credit_transactions IS 'History of scraper credit purchases and usage';
COMMENT ON FUNCTION get_user_scraper_credits IS 'Get user current scraper credit balance';
COMMENT ON FUNCTION deduct_scraper_credits IS 'Deduct scraper credits from user account';
COMMENT ON FUNCTION add_scraper_credits IS 'Add scraper credits to user account';

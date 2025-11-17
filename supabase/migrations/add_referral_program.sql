-- Referral Program Tables and Functions
-- Tracks referral codes, referrals, and rewards (1 month free premium)

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0
);

-- Create referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, rewarded
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reward_granted_at TIMESTAMPTZ,
  UNIQUE(referred_user_id) -- Each user can only be referred once
);

-- Create referral_rewards table
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) DEFAULT 'premium_month', -- premium_month, points, etc
  reward_value INTEGER DEFAULT 30, -- Days of premium for month
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON public.referral_rewards(user_id);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_codes
CREATE POLICY "Users can view their own referral codes"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own referral codes"
  ON public.referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own referral codes"
  ON public.referral_codes FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for referrals
CREATE POLICY "Users can view referrals they made or received"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "System can create referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referrals"
  ON public.referrals FOR UPDATE
  USING (true);

-- RLS Policies for referral_rewards
CREATE POLICY "Users can view their own rewards"
  ON public.referral_rewards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can create rewards"
  ON public.referral_rewards FOR INSERT
  WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code(
  p_user_id UUID
)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_code VARCHAR(20);
  v_exists BOOLEAN;
BEGIN
  -- Try to generate a unique code (max 10 attempts)
  FOR i IN 1..10 LOOP
    -- Generate code: 8 random uppercase alphanumeric characters
    v_code := upper(substring(md5(random()::text || p_user_id::text || now()::text) from 1 for 8));

    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = v_code) INTO v_exists;

    IF NOT v_exists THEN
      RETURN v_code;
    END IF;
  END LOOP;

  -- If we couldn't generate a unique code, raise an error
  RAISE EXCEPTION 'Could not generate unique referral code';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create referral code for user
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(
  p_user_id UUID
)
RETURNS TABLE(
  code VARCHAR(20),
  total_referrals INTEGER,
  successful_referrals INTEGER,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_code VARCHAR(20);
BEGIN
  -- Try to get existing code
  SELECT rc.code, rc.total_referrals, rc.successful_referrals, rc.created_at
  INTO code, total_referrals, successful_referrals, created_at
  FROM public.referral_codes rc
  WHERE rc.user_id = p_user_id AND rc.is_active = true
  LIMIT 1;

  -- If no code exists, create one
  IF NOT FOUND THEN
    v_code := public.generate_referral_code(p_user_id);

    INSERT INTO public.referral_codes (user_id, code)
    VALUES (p_user_id, v_code)
    RETURNING referral_codes.code, referral_codes.total_referrals,
              referral_codes.successful_referrals, referral_codes.created_at
    INTO code, total_referrals, successful_referrals, created_at;
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and apply referral code
CREATE OR REPLACE FUNCTION public.apply_referral_code(
  p_referred_user_id UUID,
  p_referral_code VARCHAR(20)
)
RETURNS JSON AS $$
DECLARE
  v_referrer_user_id UUID;
  v_referral_id UUID;
  v_result JSON;
BEGIN
  -- Check if referred user already has a referral
  IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_user_id = p_referred_user_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User has already been referred'
    );
  END IF;

  -- Get referrer user ID from code
  SELECT user_id INTO v_referrer_user_id
  FROM public.referral_codes
  WHERE code = p_referral_code AND is_active = true;

  IF v_referrer_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid referral code'
    );
  END IF;

  -- Can't refer yourself
  IF v_referrer_user_id = p_referred_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot use your own referral code'
    );
  END IF;

  -- Create referral record
  INSERT INTO public.referrals (referrer_user_id, referred_user_id, referral_code, status)
  VALUES (v_referrer_user_id, p_referred_user_id, p_referral_code, 'pending')
  RETURNING id INTO v_referral_id;

  -- Update total referrals count
  UPDATE public.referral_codes
  SET total_referrals = total_referrals + 1
  WHERE code = p_referral_code;

  RETURN json_build_object(
    'success', true,
    'referral_id', v_referral_id,
    'message', 'Referral code applied successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete referral and grant rewards
CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referral_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_referral RECORD;
  v_reward_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get referral details
  SELECT * INTO v_referral
  FROM public.referrals
  WHERE id = p_referral_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Referral not found'
    );
  END IF;

  -- Check if already completed
  IF v_referral.status != 'pending' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Referral already processed'
    );
  END IF;

  -- Mark referral as completed
  UPDATE public.referrals
  SET status = 'completed', completed_at = now()
  WHERE id = p_referral_id;

  -- Update successful referrals count
  UPDATE public.referral_codes
  SET successful_referrals = successful_referrals + 1
  WHERE user_id = v_referral.referrer_user_id;

  -- Grant reward to referrer (1 month premium)
  v_expires_at := now() + INTERVAL '30 days';

  INSERT INTO public.referral_rewards (
    user_id,
    referral_id,
    reward_type,
    reward_value,
    expires_at,
    is_active
  )
  VALUES (
    v_referral.referrer_user_id,
    p_referral_id,
    'premium_month',
    30,
    v_expires_at,
    true
  )
  RETURNING id INTO v_reward_id;

  -- Mark referral as rewarded
  UPDATE public.referrals
  SET status = 'rewarded', reward_granted_at = now()
  WHERE id = p_referral_id;

  RETURN json_build_object(
    'success', true,
    'reward_id', v_reward_id,
    'expires_at', v_expires_at,
    'message', 'Referral completed and reward granted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's referral stats
CREATE OR REPLACE FUNCTION public.get_referral_stats(
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_stats JSON;
BEGIN
  SELECT json_build_object(
    'referral_code', (
      SELECT code FROM public.referral_codes
      WHERE user_id = p_user_id AND is_active = true
      LIMIT 1
    ),
    'total_referrals', (
      SELECT COUNT(*) FROM public.referrals
      WHERE referrer_user_id = p_user_id
    ),
    'successful_referrals', (
      SELECT COUNT(*) FROM public.referrals
      WHERE referrer_user_id = p_user_id AND status IN ('completed', 'rewarded')
    ),
    'pending_referrals', (
      SELECT COUNT(*) FROM public.referrals
      WHERE referrer_user_id = p_user_id AND status = 'pending'
    ),
    'active_rewards', (
      SELECT COUNT(*) FROM public.referral_rewards
      WHERE user_id = p_user_id
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > now())
    ),
    'total_days_earned', (
      SELECT COALESCE(SUM(reward_value), 0) FROM public.referral_rewards
      WHERE user_id = p_user_id
        AND reward_type = 'premium_month'
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has active referral reward
CREATE OR REPLACE FUNCTION public.has_active_referral_reward(
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.referral_rewards
    WHERE user_id = p_user_id
      AND is_active = true
      AND reward_type = 'premium_month'
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

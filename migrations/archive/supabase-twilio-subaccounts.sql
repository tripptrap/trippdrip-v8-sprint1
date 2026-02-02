-- Twilio Subaccount Management for Multi-Tenant Architecture
-- Each user gets their own Twilio subaccount when they purchase a membership

-- Update user_preferences table to support Twilio subaccounts
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS twilio_subaccount_sid VARCHAR(100),
ADD COLUMN IF NOT EXISTS twilio_subaccount_auth_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS twilio_subaccount_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS twilio_subaccount_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS twilio_subaccount_friendly_name VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_twilio_subaccount
ON public.user_preferences(twilio_subaccount_sid);

-- Create table to track user's Twilio phone numbers
CREATE TABLE IF NOT EXISTS public.user_twilio_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  phone_sid VARCHAR(100) NOT NULL,
  friendly_name VARCHAR(255),
  capabilities JSONB DEFAULT '{
    "voice": true,
    "sms": true,
    "mms": true,
    "rcs": false
  }'::jsonb,
  is_primary BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'active',
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, phone_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_twilio_numbers_user_id
ON public.user_twilio_numbers(user_id);

CREATE INDEX IF NOT EXISTS idx_user_twilio_numbers_phone
ON public.user_twilio_numbers(phone_number);

CREATE INDEX IF NOT EXISTS idx_user_twilio_numbers_primary
ON public.user_twilio_numbers(user_id, is_primary)
WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.user_twilio_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_twilio_numbers
CREATE POLICY "Users can view their own Twilio numbers"
  ON public.user_twilio_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Twilio numbers"
  ON public.user_twilio_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Twilio numbers"
  ON public.user_twilio_numbers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Twilio numbers"
  ON public.user_twilio_numbers FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_user_twilio_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_twilio_numbers_updated_at
  BEFORE UPDATE ON public.user_twilio_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_twilio_numbers_updated_at();

-- Function to get user's primary Twilio number
CREATE OR REPLACE FUNCTION public.get_user_primary_twilio_number(user_id_param UUID)
RETURNS VARCHAR AS $$
DECLARE
  primary_number VARCHAR;
BEGIN
  SELECT phone_number INTO primary_number
  FROM public.user_twilio_numbers
  WHERE user_id = user_id_param AND is_primary = true AND status = 'active'
  LIMIT 1;

  -- If no primary number, get the first active number
  IF primary_number IS NULL THEN
    SELECT phone_number INTO primary_number
    FROM public.user_twilio_numbers
    WHERE user_id = user_id_param AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  RETURN primary_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's Twilio credentials (for server-side use only)
CREATE OR REPLACE FUNCTION public.get_user_twilio_credentials(user_id_param UUID)
RETURNS TABLE(
  account_sid VARCHAR,
  auth_token_encrypted TEXT,
  subaccount_status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    twilio_subaccount_sid,
    twilio_subaccount_auth_token_encrypted,
    twilio_subaccount_status
  FROM public.user_preferences
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to ensure only one primary number per user
CREATE OR REPLACE FUNCTION public.ensure_single_primary_twilio_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    -- Set all other numbers for this user to not primary
    UPDATE public.user_twilio_numbers
    SET is_primary = false
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_primary_twilio_number
  BEFORE INSERT OR UPDATE ON public.user_twilio_numbers
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION public.ensure_single_primary_twilio_number();

COMMENT ON TABLE public.user_twilio_numbers IS 'Twilio phone numbers owned by each user under their subaccount';
COMMENT ON COLUMN public.user_preferences.twilio_subaccount_sid IS 'Twilio subaccount SID for this user';
COMMENT ON COLUMN public.user_preferences.twilio_subaccount_auth_token_encrypted IS 'Encrypted auth token for user Twilio subaccount';
COMMENT ON COLUMN public.user_preferences.twilio_subaccount_status IS 'Status of subaccount: pending, active, suspended, closed';
COMMENT ON FUNCTION public.get_user_primary_twilio_number IS 'Returns the primary Twilio phone number for a user';
COMMENT ON FUNCTION public.get_user_twilio_credentials IS 'Returns Twilio subaccount credentials for server-side use';

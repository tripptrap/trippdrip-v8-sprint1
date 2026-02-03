-- =============================================================
-- Fix phone number management tables
-- =============================================================

-- 1. Add missing columns to user_telnyx_numbers
ALTER TABLE public.user_telnyx_numbers
ADD COLUMN IF NOT EXISTS messaging_profile_id TEXT,
ADD COLUMN IF NOT EXISTS telnyx_connection_id TEXT,
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS number_type TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS credits_charged INTEGER,
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS pool_number_id UUID;

-- Add unique constraint on phone_number if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_telnyx_numbers_phone_number_key'
  ) THEN
    ALTER TABLE public.user_telnyx_numbers ADD CONSTRAINT user_telnyx_numbers_phone_number_key UNIQUE (phone_number);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 2. Add missing columns to user_twilio_numbers
ALTER TABLE public.user_twilio_numbers
ADD COLUMN IF NOT EXISTS is_from_pool BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pool_number_id UUID;

-- 3. Create number_pool table
CREATE TABLE IF NOT EXISTS public.number_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  number_type TEXT NOT NULL DEFAULT 'tollfree',
  phone_sid TEXT,
  capabilities JSONB DEFAULT '{"sms": true, "mms": true, "voice": false}'::jsonb,
  master_account_sid TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_assigned BOOLEAN DEFAULT false,
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_number_pool_available ON public.number_pool(is_assigned, is_verified);
CREATE INDEX IF NOT EXISTS idx_number_pool_user ON public.number_pool(assigned_to_user_id);

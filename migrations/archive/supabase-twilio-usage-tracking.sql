-- Twilio Usage Tracking Schema
-- Track monthly Twilio usage per user for billing purposes

-- Create table to store monthly usage records
CREATE TABLE IF NOT EXISTS public.twilio_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subaccount_sid VARCHAR(100) NOT NULL,

  -- Usage period
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Usage metrics
  sms_count INTEGER DEFAULT 0,
  sms_cost DECIMAL(10, 4) DEFAULT 0.00,
  mms_count INTEGER DEFAULT 0,
  mms_cost DECIMAL(10, 4) DEFAULT 0.00,
  call_count INTEGER DEFAULT 0,
  call_cost DECIMAL(10, 4) DEFAULT 0.00,
  phone_number_cost DECIMAL(10, 4) DEFAULT 0.00,
  total_cost DECIMAL(10, 4) DEFAULT 0.00,

  -- Billing status
  billing_status VARCHAR(50) DEFAULT 'pending', -- pending, invoiced, paid, failed
  stripe_invoice_id VARCHAR(255),
  stripe_invoice_item_id VARCHAR(255),

  -- Metadata
  usage_data JSONB, -- Store full Twilio usage response
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one record per user per period
  UNIQUE(user_id, period_start, period_end)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_twilio_usage_user_id ON public.twilio_usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_twilio_usage_period ON public.twilio_usage_records(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_twilio_usage_billing_status ON public.twilio_usage_records(billing_status);

-- Enable RLS
ALTER TABLE public.twilio_usage_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own usage records
CREATE POLICY "Users can view own usage records"
  ON public.twilio_usage_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update usage records
CREATE POLICY "Service role can manage usage records"
  ON public.twilio_usage_records
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_twilio_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_twilio_usage_records_updated_at
  BEFORE UPDATE ON public.twilio_usage_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_twilio_usage_updated_at();

-- Helper function to get user's current month usage
CREATE OR REPLACE FUNCTION public.get_user_current_month_usage(p_user_id UUID)
RETURNS TABLE (
  sms_count INTEGER,
  sms_cost DECIMAL,
  mms_count INTEGER,
  mms_cost DECIMAL,
  total_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(tur.sms_count), 0)::INTEGER,
    COALESCE(SUM(tur.sms_cost), 0.00),
    COALESCE(SUM(tur.mms_count), 0)::INTEGER,
    COALESCE(SUM(tur.mms_cost), 0.00),
    COALESCE(SUM(tur.total_cost), 0.00)
  FROM public.twilio_usage_records tur
  WHERE tur.user_id = p_user_id
    AND tur.period_start >= date_trunc('month', NOW())
    AND tur.period_end <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_current_month_usage(UUID) TO authenticated;

COMMENT ON TABLE public.twilio_usage_records IS 'Stores monthly Twilio usage records for billing purposes';
COMMENT ON COLUMN public.twilio_usage_records.billing_status IS 'Status: pending, invoiced, paid, failed';

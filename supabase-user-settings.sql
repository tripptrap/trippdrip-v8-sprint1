-- User Settings and Preferences
-- Extends the users table with customization options

-- Add settings columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "email_on_new_lead": true,
  "email_on_reply": true,
  "sms_on_urgent": false,
  "daily_summary": true
}'::jsonb,
ADD COLUMN IF NOT EXISTS default_message_signature TEXT,
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "enabled": false,
  "monday": {"start": "09:00", "end": "17:00"},
  "tuesday": {"start": "09:00", "end": "17:00"},
  "wednesday": {"start": "09:00", "end": "17:00"},
  "thursday": {"start": "09:00", "end": "17:00"},
  "friday": {"start": "09:00", "end": "17:00"},
  "saturday": null,
  "sunday": null
}'::jsonb,
ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_reply_message TEXT;

-- Create user_preferences table for more complex settings
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Display preferences
  theme VARCHAR(20) DEFAULT 'dark',
  compact_view BOOLEAN DEFAULT false,
  items_per_page INTEGER DEFAULT 25,

  -- Lead management defaults
  default_lead_status VARCHAR(50) DEFAULT 'new',
  default_lead_source VARCHAR(100),
  auto_score_leads BOOLEAN DEFAULT true,

  -- Message preferences
  require_message_confirmation BOOLEAN DEFAULT false,
  enable_smart_replies BOOLEAN DEFAULT true,
  auto_capitalize BOOLEAN DEFAULT true,

  -- Integration settings
  twilio_phone_number VARCHAR(20),
  twilio_account_sid VARCHAR(100),
  twilio_auth_token_encrypted TEXT,
  email_provider VARCHAR(50),
  email_api_key_encrypted TEXT,

  -- Advanced features
  enable_ai_suggestions BOOLEAN DEFAULT true,
  auto_tag_conversations BOOLEAN DEFAULT false,
  enable_duplicate_detection BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON public.user_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_preferences_updated_at();

-- Function to initialize user preferences
CREATE OR REPLACE FUNCTION public.initialize_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create preferences for new users
CREATE TRIGGER create_user_preferences_on_signup
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_preferences();

-- Function to check if user is within business hours
CREATE OR REPLACE FUNCTION public.is_within_business_hours(
  user_id_param UUID,
  check_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  business_hours JSONB;
  is_enabled BOOLEAN;
  day_name TEXT;
  day_hours JSONB;
  start_time TIME;
  end_time TIME;
  check_time_only TIME;
BEGIN
  -- Get business hours
  SELECT u.business_hours INTO business_hours
  FROM public.users u
  WHERE u.id = user_id_param;

  -- Check if business hours are enabled
  is_enabled := (business_hours->>'enabled')::BOOLEAN;

  IF NOT is_enabled THEN
    RETURN true; -- If business hours not enabled, always return true
  END IF;

  -- Get day of week (lowercase)
  day_name := lower(to_char(check_time, 'Day'));
  day_name := trim(day_name);

  -- Get hours for this day
  day_hours := business_hours->day_name;

  IF day_hours IS NULL OR day_hours = 'null'::jsonb THEN
    RETURN false; -- Day is closed
  END IF;

  -- Extract start and end times
  start_time := (day_hours->>'start')::TIME;
  end_time := (day_hours->>'end')::TIME;
  check_time_only := check_time::TIME;

  -- Check if current time is within business hours
  RETURN check_time_only >= start_time AND check_time_only <= end_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's full settings (combines users and user_preferences)
CREATE OR REPLACE FUNCTION public.get_user_settings(user_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', u.full_name,
      'phone_number', u.phone_number,
      'business_name', u.business_name,
      'timezone', u.timezone,
      'notification_preferences', u.notification_preferences,
      'default_message_signature', u.default_message_signature,
      'business_hours', u.business_hours,
      'auto_reply_enabled', u.auto_reply_enabled,
      'auto_reply_message', u.auto_reply_message,
      'credits', u.credits,
      'subscription_tier', u.subscription_tier,
      'subscription_status', u.subscription_status
    ),
    'preferences', jsonb_build_object(
      'theme', p.theme,
      'compact_view', p.compact_view,
      'items_per_page', p.items_per_page,
      'default_lead_status', p.default_lead_status,
      'default_lead_source', p.default_lead_source,
      'auto_score_leads', p.auto_score_leads,
      'require_message_confirmation', p.require_message_confirmation,
      'enable_smart_replies', p.enable_smart_replies,
      'auto_capitalize', p.auto_capitalize,
      'enable_ai_suggestions', p.enable_ai_suggestions,
      'auto_tag_conversations', p.auto_tag_conversations,
      'enable_duplicate_detection', p.enable_duplicate_detection,
      'has_twilio_configured', p.twilio_phone_number IS NOT NULL,
      'has_email_configured', p.email_provider IS NOT NULL
    )
  ) INTO result
  FROM public.users u
  LEFT JOIN public.user_preferences p ON u.id = p.user_id
  WHERE u.id = user_id_param;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.user_preferences IS 'User customization preferences and integration settings';
COMMENT ON COLUMN public.users.business_hours IS 'Business hours configuration for scheduling messages';
COMMENT ON COLUMN public.users.notification_preferences IS 'Email and SMS notification settings';
COMMENT ON COLUMN public.user_preferences.twilio_auth_token_encrypted IS 'Encrypted Twilio auth token';
COMMENT ON COLUMN public.user_preferences.email_api_key_encrypted IS 'Encrypted email provider API key';
COMMENT ON FUNCTION public.is_within_business_hours IS 'Checks if a given time falls within user business hours';
COMMENT ON FUNCTION public.get_user_settings IS 'Returns complete user settings including preferences';

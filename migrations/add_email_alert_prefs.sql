-- Add email alert notification preference columns to user_preferences
-- Run this in the Supabase SQL editor

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_alert_new_message BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_alert_low_credits BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_alert_opt_out BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_alert_appointment BOOLEAN DEFAULT true;

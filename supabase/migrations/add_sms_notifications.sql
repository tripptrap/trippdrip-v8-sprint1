-- Add SMS notification preferences to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS sms_alerts_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_alert_new_message BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_alert_low_credits BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_alert_opt_out BOOLEAN DEFAULT false;

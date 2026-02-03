-- Migration: Remove Twilio tables and columns
-- Description: Drop Twilio-specific tables and remove Twilio columns from user_preferences
-- Run this AFTER deploying the code changes that remove all Twilio references

-- Drop Twilio-specific tables
DROP TABLE IF EXISTS user_twilio_numbers CASCADE;
DROP TABLE IF EXISTS twilio_usage_records CASCADE;
DROP TABLE IF EXISTS twilio_subaccounts CASCADE;

-- Remove Twilio columns from user_preferences (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_phone_number') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_phone_number;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_account_sid') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_account_sid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_auth_token') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_auth_token;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_auth_token_encrypted') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_auth_token_encrypted;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_subaccount_sid') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_subaccount_sid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_subaccount_auth_token_encrypted') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_subaccount_auth_token_encrypted;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_subaccount_status') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_subaccount_status;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_subaccount_created_at') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_subaccount_created_at;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'twilio_subaccount_friendly_name') THEN
    ALTER TABLE user_preferences DROP COLUMN twilio_subaccount_friendly_name;
  END IF;
END $$;

-- Remove twilio_config from user_settings (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'twilio_config') THEN
    ALTER TABLE user_settings DROP COLUMN twilio_config;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'sms_provider') THEN
    ALTER TABLE user_settings DROP COLUMN sms_provider;
  END IF;
END $$;

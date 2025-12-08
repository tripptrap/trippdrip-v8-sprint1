-- Add Google Calendar integration columns to users table
-- Run this migration in Supabase SQL Editor

-- Add columns for storing Google Calendar OAuth tokens
ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_calendar_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_token_expiry TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN users.google_calendar_access_token IS 'Google Calendar OAuth access token';
COMMENT ON COLUMN users.google_calendar_refresh_token IS 'Google Calendar OAuth refresh token (long-lived)';
COMMENT ON COLUMN users.google_calendar_token_expiry IS 'When the access token expires';

-- Create index for faster lookups of users with calendar connected
CREATE INDEX IF NOT EXISTS idx_users_google_calendar_connected
ON users(google_calendar_refresh_token)
WHERE google_calendar_refresh_token IS NOT NULL;

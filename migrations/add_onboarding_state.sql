-- Add onboarding_state JSONB column to users table
-- Tracks which post-payment onboarding steps have been completed
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT '{
  "phone_selected": false,
  "theme_selected": false,
  "tour_completed": false,
  "completed": false
}'::jsonb;

-- Fix: Change default theme from 'dark' to 'light' for new users
ALTER TABLE public.user_preferences
ALTER COLUMN theme SET DEFAULT 'light';

-- Update existing users who have default 'dark' and haven't explicitly chosen
-- (Only run this if you want to reset all dark-mode users to light — optional)
-- UPDATE public.user_preferences SET theme = 'light' WHERE theme = 'dark';

-- Adds the toggle for showing the hot/cold lead engagement badge in
-- Messages (moved there from the Leads list per user request). Off by
-- default -- existing users don't see it until they opt in via Settings.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS show_lead_temperature BOOLEAN NOT NULL DEFAULT false;

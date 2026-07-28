-- Tracks when a paused subscription (see /api/stripe/pause-subscription)
-- will automatically resume billing, so the UI can show "Paused until X"
-- without a round-trip to Stripe on every page load.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pause_resumes_at TIMESTAMPTZ;

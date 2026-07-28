-- The webhook that processes a completed subscription checkout logs
-- session.customer and session.subscription but never persists either —
-- stripe_customer_id was never written anywhere, and there was no column
-- at all to hold the subscription id. Result: every real user has
-- stripe_customer_id = null, which breaks the "Manage Billing" portal
-- button for everyone, and there was no way to look up a user's real
-- Stripe subscription to actually change its price on upgrade/downgrade.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

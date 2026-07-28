-- The webhook's existing comment claims duplicate Stripe webhook deliveries
-- are caught by a stripe_session_id uniqueness violation ("CRIT-4"), but no
-- such constraint actually existed in the database — a duplicate delivery
-- would silently insert a second row and double-grant credits. Needed now
-- more than ever: the new invoice.paid renewal handler relies on this same
-- dedup pattern using the invoice id as the key.
--
-- stripe_session_id is NULL for the vast majority of rows (ordinary spend
-- transactions never set it) — a UNIQUE constraint on a nullable column in
-- Postgres only enforces uniqueness among non-NULL values, so this doesn't
-- affect anything except the Stripe-originated rows it's meant to guard.

CREATE UNIQUE INDEX IF NOT EXISTS points_transactions_stripe_session_id_key
  ON public.points_transactions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

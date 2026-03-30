-- Migration: porting_orders table
-- Tracks number porting requests submitted by users

CREATE TABLE IF NOT EXISTS porting_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number              TEXT NOT NULL,
  carrier_name              TEXT NOT NULL,
  account_number            TEXT NOT NULL,
  account_pin               TEXT NOT NULL,
  authorized_name           TEXT NOT NULL,
  billing_street            TEXT NOT NULL,
  billing_city              TEXT NOT NULL,
  billing_state             TEXT NOT NULL,
  billing_zip               TEXT NOT NULL,
  telnyx_porting_order_id   TEXT,
  status                    TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'pending', 'in_progress', 'complete', 'failed', 'cancelled', 'review_needed')),
  status_details            TEXT,
  submitted_at              TIMESTAMPTZ DEFAULT NOW(),
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE porting_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own porting orders"
  ON porting_orders FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can access all porting orders"
  ON porting_orders FOR ALL
  TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS idx_porting_orders_user_id ON porting_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_porting_orders_status ON porting_orders(status);
CREATE INDEX IF NOT EXISTS idx_porting_orders_telnyx_id ON porting_orders(telnyx_porting_order_id);

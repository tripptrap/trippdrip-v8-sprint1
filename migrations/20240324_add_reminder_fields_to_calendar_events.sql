ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_status TEXT DEFAULT 'pending';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS cancellation_status TEXT DEFAULT NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS lead_phone TEXT DEFAULT NULL;

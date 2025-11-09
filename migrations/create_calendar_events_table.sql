-- Create calendar_events table for storing Google Calendar appointments
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  attendee_email TEXT,
  attendee_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead_id ON calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id ON calendar_events(google_event_id);

-- Add comment for documentation
COMMENT ON TABLE calendar_events IS 'Stores Google Calendar events created through the app';

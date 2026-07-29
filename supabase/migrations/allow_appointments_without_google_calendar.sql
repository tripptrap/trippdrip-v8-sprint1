-- Let an appointment exist without Google Calendar (#70).
--
-- calendar_events.google_event_id was NOT NULL, so a row could only be written
-- after a successful Google Calendar insert. CLAUDE.md describes connecting
-- Google as optional ("Optionally connect Google Calendar"), and only 1 of 7
-- users currently has it connected — so as it stood, AI-booked appointments
-- would be impossible for almost everyone.
--
-- An appointment is a HyveWyre concept; the Google event is a synced copy of
-- it. NULL now means "booked, not synced to Google", which is the normal state
-- for a user who never connected it.

ALTER TABLE public.calendar_events
  ALTER COLUMN google_event_id DROP NOT NULL;

COMMENT ON COLUMN public.calendar_events.google_event_id IS
  'Google Calendar event id when the user has Google connected and the sync succeeded. NULL means the appointment exists in HyveWyre only — expected when Google is not connected.';

-- Booking a flow appointment looks the lead up by phone, and the reminder cron
-- scans for events that still need one.
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead
  ON public.calendar_events(lead_id)
  WHERE lead_id IS NOT NULL;

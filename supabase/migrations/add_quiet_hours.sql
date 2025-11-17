-- Add Quiet Hours Feature
-- Allows users to set time restrictions for automated message sending (e.g., 8am-8pm)
-- This is simpler than full business hours and applies to all automated sends

-- Add quiet hours columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS quiet_hours_start TIME DEFAULT '08:00:00',
ADD COLUMN IF NOT EXISTS quiet_hours_end TIME DEFAULT '20:00:00';

-- Function to check if current time is within user's quiet hours (respects timezone)
CREATE OR REPLACE FUNCTION public.is_within_quiet_hours(
  user_id_param UUID,
  check_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  quiet_hours_enabled BOOLEAN;
  quiet_start TIME;
  quiet_end TIME;
  user_timezone TEXT;
  local_time TIMESTAMP WITH TIME ZONE;
  local_time_only TIME;
BEGIN
  -- Get user's quiet hours settings and timezone
  SELECT
    u.quiet_hours_enabled,
    u.quiet_hours_start,
    u.quiet_hours_end,
    COALESCE(u.timezone, 'America/New_York')
  INTO
    quiet_hours_enabled,
    quiet_start,
    quiet_end,
    user_timezone
  FROM public.users u
  WHERE u.id = user_id_param;

  -- If quiet hours are disabled, always return true (can send anytime)
  IF NOT quiet_hours_enabled THEN
    RETURN true;
  END IF;

  -- Convert check_time to user's timezone
  local_time := check_time AT TIME ZONE user_timezone;
  local_time_only := local_time::TIME;

  -- Check if current time is within quiet hours (allowed sending window)
  RETURN local_time_only >= quiet_start AND local_time_only <= quiet_end;
END;
$$ LANGUAGE plpgsql;

-- Function to get next allowed send time (respects quiet hours)
CREATE OR REPLACE FUNCTION public.get_next_allowed_send_time(
  user_id_param UUID,
  proposed_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  quiet_hours_enabled BOOLEAN;
  quiet_start TIME;
  quiet_end TIME;
  user_timezone TEXT;
  local_time TIMESTAMP WITH TIME ZONE;
  local_time_only TIME;
  next_send_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get user's quiet hours settings and timezone
  SELECT
    u.quiet_hours_enabled,
    u.quiet_hours_start,
    u.quiet_hours_end,
    COALESCE(u.timezone, 'America/New_York')
  INTO
    quiet_hours_enabled,
    quiet_start,
    quiet_end,
    user_timezone
  FROM public.users u
  WHERE u.id = user_id_param;

  -- If quiet hours are disabled, return proposed time
  IF NOT quiet_hours_enabled THEN
    RETURN proposed_time;
  END IF;

  -- Convert to user's timezone
  local_time := proposed_time AT TIME ZONE user_timezone;
  local_time_only := local_time::TIME;

  -- If within quiet hours, return proposed time
  IF local_time_only >= quiet_start AND local_time_only <= quiet_end THEN
    RETURN proposed_time;
  END IF;

  -- If before quiet hours start, set to quiet hours start today
  IF local_time_only < quiet_start THEN
    next_send_time := (local_time::DATE + quiet_start) AT TIME ZONE user_timezone;
    RETURN next_send_time;
  END IF;

  -- If after quiet hours end, set to quiet hours start tomorrow
  IF local_time_only > quiet_end THEN
    next_send_time := ((local_time::DATE + INTERVAL '1 day') + quiet_start) AT TIME ZONE user_timezone;
    RETURN next_send_time;
  END IF;

  -- Fallback: return proposed time
  RETURN proposed_time;
END;
$$ LANGUAGE plpgsql;

-- Update the existing get_messages_ready_to_send function to respect quiet hours
CREATE OR REPLACE FUNCTION public.get_messages_ready_to_send()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  lead_id UUID,
  body TEXT,
  subject TEXT,
  channel VARCHAR(20),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  credits_cost INTEGER,
  segments INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.id,
    sm.user_id,
    sm.lead_id,
    sm.body,
    sm.subject,
    sm.channel,
    sm.scheduled_for,
    sm.credits_cost,
    sm.segments
  FROM scheduled_messages sm
  WHERE sm.status = 'pending'
    AND sm.scheduled_for <= NOW()
    AND public.is_within_quiet_hours(sm.user_id, NOW())
  ORDER BY sm.scheduled_for ASC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN public.users.quiet_hours_enabled IS 'Enable quiet hours restrictions (8am-8pm by default)';
COMMENT ON COLUMN public.users.quiet_hours_start IS 'Start time for allowed message sending (default 8am)';
COMMENT ON COLUMN public.users.quiet_hours_end IS 'End time for allowed message sending (default 8pm)';
COMMENT ON FUNCTION public.is_within_quiet_hours IS 'Checks if current time is within user quiet hours (allowed sending window)';
COMMENT ON FUNCTION public.get_next_allowed_send_time IS 'Returns next allowed send time respecting quiet hours';

-- Scheduled Messages and Campaigns
-- Tables and functions for scheduling message sending

-- Create scheduled_messages table
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'sms', -- 'sms' or 'email'
  subject VARCHAR(500), -- For email
  body TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  credits_cost INTEGER DEFAULT 2,
  segments INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scheduled_campaigns table
CREATE TABLE IF NOT EXISTS public.scheduled_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  lead_ids UUID[] NOT NULL,
  total_leads INTEGER NOT NULL,
  leads_sent INTEGER DEFAULT 0,
  percentage_per_batch INTEGER DEFAULT 10,
  interval_hours INTEGER DEFAULT 1,
  next_batch_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'running', 'paused', 'completed', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_lead_id ON public.scheduled_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON public.scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_campaigns_user_id ON public.scheduled_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_campaigns_next_batch ON public.scheduled_campaigns(next_batch_date) WHERE status IN ('scheduled', 'running');
CREATE INDEX IF NOT EXISTS idx_scheduled_campaigns_status ON public.scheduled_campaigns(status);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_messages
CREATE POLICY "Users can view their own scheduled messages"
  ON public.scheduled_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled messages"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled messages"
  ON public.scheduled_messages FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for scheduled_campaigns
CREATE POLICY "Users can view their own scheduled campaigns"
  ON public.scheduled_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled campaigns"
  ON public.scheduled_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled campaigns"
  ON public.scheduled_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled campaigns"
  ON public.scheduled_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_scheduled_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_updated_at();

CREATE TRIGGER update_scheduled_campaigns_updated_at
  BEFORE UPDATE ON public.scheduled_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_updated_at();

-- Function to get messages ready to send
CREATE OR REPLACE FUNCTION public.get_messages_ready_to_send()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  lead_id UUID,
  channel VARCHAR,
  subject VARCHAR,
  body TEXT,
  credits_cost INTEGER,
  segments INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.id,
    sm.user_id,
    sm.lead_id,
    sm.channel,
    sm.subject,
    sm.body,
    sm.credits_cost,
    sm.segments
  FROM public.scheduled_messages sm
  WHERE sm.status = 'pending'
    AND sm.scheduled_for <= NOW()
  ORDER BY sm.scheduled_for ASC
  LIMIT 100; -- Process max 100 messages per cron run
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get campaigns ready for next batch
CREATE OR REPLACE FUNCTION public.get_campaigns_ready_for_batch()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  message TEXT,
  lead_ids UUID[],
  total_leads INTEGER,
  leads_sent INTEGER,
  percentage_per_batch INTEGER,
  interval_hours INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.user_id,
    sc.message,
    sc.lead_ids,
    sc.total_leads,
    sc.leads_sent,
    sc.percentage_per_batch,
    sc.interval_hours
  FROM public.scheduled_campaigns sc
  WHERE sc.status IN ('scheduled', 'running')
    AND sc.next_batch_date <= NOW()
    AND sc.leads_sent < sc.total_leads
  ORDER BY sc.next_batch_date ASC
  LIMIT 10; -- Process max 10 campaigns per cron run
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule a message
CREATE OR REPLACE FUNCTION public.schedule_message(
  user_id_param UUID,
  lead_id_param UUID,
  body_param TEXT,
  scheduled_for_param TIMESTAMP WITH TIME ZONE,
  channel_param VARCHAR DEFAULT 'sms',
  subject_param VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  message_id UUID;
  segments_count INTEGER;
  credits_needed INTEGER;
BEGIN
  -- Calculate segments and credits
  segments_count := CEIL(LENGTH(body_param)::FLOAT / 160);
  credits_needed := segments_count * 2;

  -- Insert scheduled message
  INSERT INTO public.scheduled_messages (
    user_id,
    lead_id,
    channel,
    subject,
    body,
    scheduled_for,
    credits_cost,
    segments
  ) VALUES (
    user_id_param,
    lead_id_param,
    channel_param,
    subject_param,
    body_param,
    scheduled_for_param,
    credits_needed,
    segments_count
  ) RETURNING id INTO message_id;

  RETURN message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.scheduled_messages IS 'Individual messages scheduled for future sending';
COMMENT ON TABLE public.scheduled_campaigns IS 'Batch campaigns with progressive sending';
COMMENT ON FUNCTION public.get_messages_ready_to_send IS 'Returns pending messages ready to send (called by cron)';
COMMENT ON FUNCTION public.get_campaigns_ready_for_batch IS 'Returns campaigns ready for next batch (called by cron)';
COMMENT ON FUNCTION public.schedule_message IS 'Schedules a message for future sending';

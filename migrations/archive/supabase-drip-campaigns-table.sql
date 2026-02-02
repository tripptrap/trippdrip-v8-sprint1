-- Drip Campaigns Table
-- Run this in your Supabase SQL Editor

-- Create drip_campaigns table
CREATE TABLE IF NOT EXISTS public.drip_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL, -- 'manual', 'no_reply', 'tag_added', 'status_change', 'lead_created'
  trigger_config JSONB DEFAULT '{}', -- Configuration for trigger (e.g., days to wait, tag name, etc.)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create drip_campaign_steps table
CREATE TABLE IF NOT EXISTS public.drip_campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.drip_campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0, -- Days to wait after previous step (0 for first step)
  delay_hours INTEGER NOT NULL DEFAULT 0, -- Additional hours
  channel VARCHAR(20) NOT NULL DEFAULT 'sms', -- 'sms', 'email'
  subject VARCHAR(500), -- For email
  content TEXT NOT NULL,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, step_number)
);

-- Create drip_campaign_enrollments table (tracks which leads are in which campaigns)
CREATE TABLE IF NOT EXISTS public.drip_campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.drip_campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  current_step INTEGER DEFAULT 0, -- Current step number (0 = not started)
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_send_at TIMESTAMP WITH TIME ZONE, -- When next message should send
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_user_id ON public.drip_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_active ON public.drip_campaigns(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_drip_campaign_steps_campaign_id ON public.drip_campaign_steps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_campaign_steps_number ON public.drip_campaign_steps(campaign_id, step_number);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_campaign_id ON public.drip_campaign_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_lead_id ON public.drip_campaign_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_next_send ON public.drip_campaign_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_status ON public.drip_campaign_enrollments(status);

-- Enable RLS
ALTER TABLE public.drip_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_campaign_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for drip_campaigns
CREATE POLICY "Users can view their own campaigns"
  ON public.drip_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
  ON public.drip_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
  ON public.drip_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
  ON public.drip_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for drip_campaign_steps
CREATE POLICY "Users can view steps for their campaigns"
  ON public.drip_campaign_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.drip_campaigns
    WHERE id = drip_campaign_steps.campaign_id
    AND user_id = auth.uid()
  ));

CREATE POLICY "Users can create steps for their campaigns"
  ON public.drip_campaign_steps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.drip_campaigns
    WHERE id = drip_campaign_steps.campaign_id
    AND user_id = auth.uid()
  ));

CREATE POLICY "Users can update steps for their campaigns"
  ON public.drip_campaign_steps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.drip_campaigns
    WHERE id = drip_campaign_steps.campaign_id
    AND user_id = auth.uid()
  ));

CREATE POLICY "Users can delete steps for their campaigns"
  ON public.drip_campaign_steps FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.drip_campaigns
    WHERE id = drip_campaign_steps.campaign_id
    AND user_id = auth.uid()
  ));

-- RLS Policies for drip_campaign_enrollments
CREATE POLICY "Users can view their own enrollments"
  ON public.drip_campaign_enrollments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own enrollments"
  ON public.drip_campaign_enrollments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own enrollments"
  ON public.drip_campaign_enrollments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own enrollments"
  ON public.drip_campaign_enrollments FOR DELETE
  USING (auth.uid() = user_id);

-- Update timestamps
CREATE OR REPLACE FUNCTION public.update_drip_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_drip_campaigns_updated_at
  BEFORE UPDATE ON public.drip_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drip_campaigns_updated_at();

CREATE TRIGGER update_drip_campaign_steps_updated_at
  BEFORE UPDATE ON public.drip_campaign_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drip_campaigns_updated_at();

CREATE TRIGGER update_drip_enrollments_updated_at
  BEFORE UPDATE ON public.drip_campaign_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drip_campaigns_updated_at();

-- Helper function to get enrollments ready to send
CREATE OR REPLACE FUNCTION public.get_drip_enrollments_ready_to_send()
RETURNS TABLE (
  enrollment_id UUID,
  campaign_id UUID,
  lead_id UUID,
  user_id UUID,
  current_step INTEGER,
  next_send_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as enrollment_id,
    e.campaign_id,
    e.lead_id,
    e.user_id,
    e.current_step,
    e.next_send_at
  FROM public.drip_campaign_enrollments e
  INNER JOIN public.drip_campaigns c ON e.campaign_id = c.id
  WHERE e.status = 'active'
    AND c.is_active = true
    AND e.next_send_at IS NOT NULL
    AND e.next_send_at <= NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.drip_campaigns IS 'Automated message sequence campaigns';
COMMENT ON TABLE public.drip_campaign_steps IS 'Individual steps/messages in a drip campaign';
COMMENT ON TABLE public.drip_campaign_enrollments IS 'Tracks which leads are enrolled in which campaigns';
COMMENT ON COLUMN public.drip_campaigns.trigger_type IS 'What triggers enrollment: manual, no_reply, tag_added, status_change, lead_created';
COMMENT ON COLUMN public.drip_campaign_enrollments.next_send_at IS 'Timestamp when next step should be sent';

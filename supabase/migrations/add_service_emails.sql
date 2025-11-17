-- Service Emails Table
-- Tracks all transactional/service emails sent to users

CREATE TABLE IF NOT EXISTS public.service_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) DEFAULT 'sent', -- sent, failed, bounced
  message_id VARCHAR(255),
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_service_emails_user_id ON public.service_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_service_emails_email_type ON public.service_emails(email_type);
CREATE INDEX IF NOT EXISTS idx_service_emails_status ON public.service_emails(status);
CREATE INDEX IF NOT EXISTS idx_service_emails_sent_at ON public.service_emails(sent_at);

-- Enable RLS
ALTER TABLE public.service_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own service emails"
  ON public.service_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert service emails"
  ON public.service_emails FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update service emails"
  ON public.service_emails FOR UPDATE
  USING (true);

-- Function to get service email stats for a user
CREATE OR REPLACE FUNCTION public.get_service_email_stats(
  p_user_id UUID,
  p_days_back INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  v_stats JSON;
BEGIN
  SELECT json_build_object(
    'total_sent', (
      SELECT COUNT(*) FROM public.service_emails
      WHERE user_id = p_user_id
        AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
    ),
    'total_failed', (
      SELECT COUNT(*) FROM public.service_emails
      WHERE user_id = p_user_id
        AND status = 'failed'
        AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
    ),
    'total_opened', (
      SELECT COUNT(*) FROM public.service_emails
      WHERE user_id = p_user_id
        AND opened_at IS NOT NULL
        AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
    ),
    'total_clicked', (
      SELECT COUNT(*) FROM public.service_emails
      WHERE user_id = p_user_id
        AND clicked_at IS NOT NULL
        AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
    ),
    'by_type', (
      SELECT json_object_agg(email_type, count)
      FROM (
        SELECT email_type, COUNT(*) as count
        FROM public.service_emails
        WHERE user_id = p_user_id
          AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
        GROUP BY email_type
      ) type_counts
    ),
    'recent_emails', (
      SELECT json_agg(
        json_build_object(
          'id', id,
          'email_type', email_type,
          'recipient', recipient,
          'subject', subject,
          'status', status,
          'sent_at', sent_at,
          'opened_at', opened_at
        ) ORDER BY sent_at DESC
      )
      FROM (
        SELECT * FROM public.service_emails
        WHERE user_id = p_user_id
          AND sent_at >= now() - (p_days_back || ' days')::INTERVAL
        ORDER BY sent_at DESC
        LIMIT 10
      ) recent
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

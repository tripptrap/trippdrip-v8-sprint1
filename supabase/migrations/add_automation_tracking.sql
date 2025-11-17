-- Add Automation Tracking to Messages
-- Track whether messages were sent via automation/flows or manually

-- Add automation tracking columns to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS automation_source VARCHAR(50), -- 'flow', 'drip_campaign', 'bulk_campaign', 'scheduled', null for manual
ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS campaign_id UUID;

-- Create index for automation queries
CREATE INDEX IF NOT EXISTS idx_messages_is_automated ON public.messages(is_automated);
CREATE INDEX IF NOT EXISTS idx_messages_automation_source ON public.messages(automation_source);
CREATE INDEX IF NOT EXISTS idx_messages_flow_id ON public.messages(flow_id);

-- Function to get automation statistics for a user
CREATE OR REPLACE FUNCTION public.get_automation_stats(
  user_id_param UUID,
  days_back INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  start_date TIMESTAMP WITH TIME ZONE;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;

  SELECT json_build_object(
    'total_messages', COUNT(*),
    'automated_messages', COUNT(*) FILTER (WHERE is_automated = true),
    'manual_messages', COUNT(*) FILTER (WHERE is_automated = false OR is_automated IS NULL),
    'automation_rate', ROUND(
      (COUNT(*) FILTER (WHERE is_automated = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),
      2
    ),
    'by_source', (
      SELECT json_object_agg(
        COALESCE(automation_source, 'manual'),
        count
      )
      FROM (
        SELECT
          COALESCE(automation_source, 'manual') as automation_source,
          COUNT(*) as count
        FROM public.messages
        WHERE user_id = user_id_param
          AND created_at >= start_date
          AND direction = 'outbound'
        GROUP BY COALESCE(automation_source, 'manual')
      ) source_counts
    ),
    'by_flow', (
      SELECT json_agg(
        json_build_object(
          'flow_id', f.id,
          'flow_name', f.name,
          'message_count', flow_stats.message_count,
          'response_count', flow_stats.response_count,
          'response_rate', flow_stats.response_rate
        )
      )
      FROM (
        SELECT
          m.flow_id,
          COUNT(DISTINCT m.id) as message_count,
          COUNT(DISTINCT responses.id) as response_count,
          ROUND(
            (COUNT(DISTINCT responses.id)::NUMERIC / NULLIF(COUNT(DISTINCT m.id)::NUMERIC, 0) * 100),
            2
          ) as response_rate
        FROM public.messages m
        LEFT JOIN public.messages responses ON
          responses.thread_id = m.thread_id
          AND responses.direction = 'inbound'
          AND responses.created_at > m.created_at
          AND responses.created_at <= m.created_at + INTERVAL '24 hours'
        WHERE m.user_id = user_id_param
          AND m.created_at >= start_date
          AND m.is_automated = true
          AND m.flow_id IS NOT NULL
        GROUP BY m.flow_id
      ) flow_stats
      LEFT JOIN public.templates f ON f.id = flow_stats.flow_id
    ),
    'daily_breakdown', (
      SELECT json_agg(
        json_build_object(
          'date', day::date,
          'automated', automated_count,
          'manual', manual_count,
          'total', automated_count + manual_count
        ) ORDER BY day DESC
      )
      FROM (
        SELECT
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) FILTER (WHERE is_automated = true) as automated_count,
          COUNT(*) FILTER (WHERE is_automated = false OR is_automated IS NULL) as manual_count
        FROM public.messages
        WHERE user_id = user_id_param
          AND created_at >= start_date
          AND direction = 'outbound'
        GROUP BY DATE_TRUNC('day', created_at)
      ) daily_counts
    )
  ) INTO result
  FROM public.messages
  WHERE user_id = user_id_param
    AND created_at >= start_date
    AND direction = 'outbound';

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get flow performance metrics
CREATE OR REPLACE FUNCTION public.get_flow_performance(
  user_id_param UUID,
  flow_id_param UUID DEFAULT NULL,
  days_back INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  start_date TIMESTAMP WITH TIME ZONE;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;

  SELECT json_agg(
    json_build_object(
      'flow_id', f.id,
      'flow_name', f.name,
      'messages_sent', metrics.messages_sent,
      'unique_leads', metrics.unique_leads,
      'responses_received', metrics.responses_received,
      'response_rate', metrics.response_rate,
      'avg_response_time_minutes', metrics.avg_response_time_minutes,
      'conversion_events', metrics.conversion_events
    )
  ) INTO result
  FROM public.templates f
  LEFT JOIN (
    SELECT
      m.flow_id,
      COUNT(DISTINCT m.id) as messages_sent,
      COUNT(DISTINCT m.lead_id) as unique_leads,
      COUNT(DISTINCT responses.id) as responses_received,
      ROUND(
        (COUNT(DISTINCT responses.id)::NUMERIC / NULLIF(COUNT(DISTINCT m.id)::NUMERIC, 0) * 100),
        2
      ) as response_rate,
      ROUND(
        AVG(EXTRACT(EPOCH FROM (responses.created_at - m.created_at)) / 60),
        2
      ) as avg_response_time_minutes,
      0 as conversion_events -- Placeholder for future enhancement
    FROM public.messages m
    LEFT JOIN public.messages responses ON
      responses.thread_id = m.thread_id
      AND responses.direction = 'inbound'
      AND responses.created_at > m.created_at
      AND responses.created_at <= m.created_at + INTERVAL '24 hours'
    WHERE m.user_id = user_id_param
      AND m.created_at >= start_date
      AND m.is_automated = true
      AND m.flow_id IS NOT NULL
      AND (flow_id_param IS NULL OR m.flow_id = flow_id_param)
    GROUP BY m.flow_id
  ) metrics ON f.id = metrics.flow_id
  WHERE f.user_id = user_id_param
    AND (flow_id_param IS NULL OR f.id = flow_id_param)
    AND metrics.messages_sent > 0;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN public.messages.is_automated IS 'Whether this message was sent via automation';
COMMENT ON COLUMN public.messages.automation_source IS 'Source of automation: flow, drip_campaign, bulk_campaign, scheduled';
COMMENT ON COLUMN public.messages.flow_id IS 'ID of the flow template that sent this message';
COMMENT ON COLUMN public.messages.campaign_id IS 'ID of the campaign that sent this message';
COMMENT ON FUNCTION public.get_automation_stats IS 'Get automation statistics for a user over specified days';
COMMENT ON FUNCTION public.get_flow_performance IS 'Get performance metrics for automated flows';

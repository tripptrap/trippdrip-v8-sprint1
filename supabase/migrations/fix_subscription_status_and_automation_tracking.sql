-- Fix 1: Add missing subscription_status column to users table
-- The get_user_settings() function references this column but it was never created
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';

-- Recreate get_user_settings() function so it works with the new column
CREATE OR REPLACE FUNCTION public.get_user_settings(user_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', u.full_name,
      'phone_number', u.phone_number,
      'business_name', u.business_name,
      'timezone', u.timezone,
      'notification_preferences', u.notification_preferences,
      'default_message_signature', u.default_message_signature,
      'business_hours', u.business_hours,
      'auto_reply_enabled', u.auto_reply_enabled,
      'auto_reply_message', u.auto_reply_message,
      'credits', u.credits,
      'subscription_tier', u.subscription_tier,
      'subscription_status', u.subscription_status
    ),
    'preferences', jsonb_build_object(
      'theme', p.theme,
      'compact_view', p.compact_view,
      'items_per_page', p.items_per_page,
      'default_lead_status', p.default_lead_status,
      'default_lead_source', p.default_lead_source,
      'auto_score_leads', p.auto_score_leads,
      'require_message_confirmation', p.require_message_confirmation,
      'enable_smart_replies', p.enable_smart_replies,
      'auto_capitalize', p.auto_capitalize,
      'enable_ai_suggestions', p.enable_ai_suggestions,
      'auto_tag_conversations', p.auto_tag_conversations,
      'enable_duplicate_detection', p.enable_duplicate_detection,
      'has_twilio_configured', p.twilio_phone_number IS NOT NULL,
      'has_email_configured', p.email_provider IS NOT NULL
    )
  ) INTO result
  FROM public.users u
  LEFT JOIN public.user_preferences p ON u.id = p.user_id
  WHERE u.id = user_id_param;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Fix 2: Fix automation tracking to use conversation_flows instead of templates
-- The original migration referenced public.templates which doesn't exist.
-- The actual table is public.conversation_flows.

-- Drop the broken foreign key constraint if it exists
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS messages_flow_id_fkey;

-- Re-add columns safely (they may already exist from the original migration attempt)
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS automation_source VARCHAR(50),
ADD COLUMN IF NOT EXISTS flow_id UUID,
ADD COLUMN IF NOT EXISTS campaign_id UUID;

-- Fix flow_id column type if it was created as text instead of uuid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'flow_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.messages
    ALTER COLUMN flow_id TYPE UUID USING CASE WHEN flow_id IS NOT NULL AND flow_id != '' THEN flow_id::uuid ELSE NULL END;
  END IF;
END $$;

-- Add the correct foreign key pointing to conversation_flows
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_flows') THEN
    ALTER TABLE public.messages
    ADD CONSTRAINT messages_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES public.conversation_flows(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists, ignore
  NULL;
END $$;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_messages_is_automated ON public.messages(is_automated);
CREATE INDEX IF NOT EXISTS idx_messages_automation_source ON public.messages(automation_source);
CREATE INDEX IF NOT EXISTS idx_messages_flow_id ON public.messages(flow_id);

-- Recreate get_automation_stats using conversation_flows
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
      LEFT JOIN public.conversation_flows f ON f.id = flow_stats.flow_id
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

-- Recreate get_flow_performance using conversation_flows
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
  FROM public.conversation_flows f
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
      0 as conversion_events
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

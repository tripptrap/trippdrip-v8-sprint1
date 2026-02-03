-- =============================================================
-- Fix all missing tables and RPC functions found during DB audit
-- =============================================================

-- -----------------------------------------------
-- 1. conversation_tags table
-- Used by: app/api/conversation-tags/route.ts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_user_id ON public.conversation_tags(user_id);

-- RLS
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_tags' AND policyname = 'conversation_tags_user_policy') THEN
    CREATE POLICY conversation_tags_user_policy ON public.conversation_tags
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- -----------------------------------------------
-- 2. get_tag_usage_stats RPC
-- Used by: app/api/conversation-tags/route.ts
-- Counts how many threads use each tag name
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tag_usage_stats(user_id_param UUID)
RETURNS TABLE(tag_name TEXT, usage_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    unnest(t.conversation_tags) AS tag_name,
    COUNT(*)::BIGINT AS usage_count
  FROM public.threads t
  WHERE t.user_id = user_id_param
    AND t.conversation_tags IS NOT NULL
    AND array_length(t.conversation_tags, 1) > 0
  GROUP BY unnest(t.conversation_tags)
  ORDER BY usage_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 3. remove_thread_tag RPC
-- Used by: app/api/conversation-tags/route.ts (on delete)
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_thread_tag(thread_id_param UUID, tag_name TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.threads
  SET conversation_tags = array_remove(conversation_tags, tag_name),
      updated_at = now()
  WHERE id = thread_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 4. add_thread_tag RPC
-- Used by: threads API
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.add_thread_tag(thread_id_param UUID, tag_name TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.threads
  SET conversation_tags = CASE
    WHEN conversation_tags @> ARRAY[tag_name] THEN conversation_tags
    ELSE array_append(conversation_tags, tag_name)
  END,
  updated_at = now()
  WHERE id = thread_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 5. archive_thread / unarchive_thread / bulk_archive_threads RPCs
-- Used by: threads API
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_thread(thread_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.threads
  SET is_archived = true, archived_at = now(), updated_at = now()
  WHERE id = thread_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unarchive_thread(thread_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.threads
  SET is_archived = false, archived_at = NULL, updated_at = now()
  WHERE id = thread_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.bulk_archive_threads(thread_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE public.threads
  SET is_archived = true, archived_at = now(), updated_at = now()
  WHERE id = ANY(thread_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 6. get_campaigns_ready_for_batch RPC
-- Used by: app/api/cron/process-scheduled/route.ts
-- Returns scheduled_campaigns that are due for next batch
-- -----------------------------------------------
DROP FUNCTION IF EXISTS public.get_campaigns_ready_for_batch();
CREATE OR REPLACE FUNCTION public.get_campaigns_ready_for_batch()
RETURNS SETOF public.scheduled_campaigns AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.scheduled_campaigns
  WHERE status IN ('scheduled', 'running')
    AND next_batch_date <= now()
  ORDER BY next_batch_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 7. get_messages_ready_to_send RPC
-- Used by: app/api/cron/process-scheduled/route.ts
-- Returns scheduled_messages that are due to be sent
-- -----------------------------------------------
DROP FUNCTION IF EXISTS public.get_messages_ready_to_send();
CREATE OR REPLACE FUNCTION public.get_messages_ready_to_send()
RETURNS SETOF public.scheduled_messages AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.scheduled_messages
  WHERE status = 'pending'
    AND scheduled_for <= now()
  ORDER BY scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 8. contact_form_submissions table
-- Used by: app/api/contact-form/route.ts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  sms_consent BOOLEAN DEFAULT false,
  email_opt_in BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'website_contact_form',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_form_phone ON public.contact_form_submissions(phone);

-- -----------------------------------------------
-- 9. emails table
-- Used by: app/api/emails/route.ts, app/api/leads/upsert/route.ts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  "to" TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON public.emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON public.emails(lead_id);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'emails' AND policyname = 'emails_user_policy') THEN
    CREATE POLICY emails_user_policy ON public.emails
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- -----------------------------------------------
-- 10. credit_transactions table
-- Used by: app/api/number-pool/purchase-with-credits/route.ts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_transactions' AND policyname = 'credit_transactions_user_policy') THEN
    CREATE POLICY credit_transactions_user_policy ON public.credit_transactions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- -----------------------------------------------
-- 11. is_within_quiet_hours RPC
-- Used by: app/api/cron/process-scheduled/route.ts
-- Checks if the current time is within the user's quiet hours
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.is_within_quiet_hours(
  user_id_param UUID,
  check_time TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS BOOLEAN AS $$
DECLARE
  user_record RECORD;
  user_local_time TIME;
BEGIN
  SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone
  INTO user_record
  FROM public.users
  WHERE id = user_id_param;

  IF NOT FOUND OR NOT user_record.quiet_hours_enabled THEN
    RETURN true; -- No quiet hours configured, always allowed
  END IF;

  -- Convert check_time to user's timezone and extract time
  user_local_time := (check_time AT TIME ZONE COALESCE(user_record.timezone, 'America/New_York'))::TIME;

  -- Check if within allowed sending window (between start and end)
  IF user_record.quiet_hours_start <= user_record.quiet_hours_end THEN
    RETURN user_local_time >= user_record.quiet_hours_start AND user_local_time < user_record.quiet_hours_end;
  ELSE
    -- Handles overnight ranges (e.g., start=20:00, end=08:00)
    RETURN user_local_time >= user_record.quiet_hours_start OR user_local_time < user_record.quiet_hours_end;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

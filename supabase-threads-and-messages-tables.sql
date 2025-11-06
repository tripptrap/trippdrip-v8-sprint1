-- Threads and Messages Tables
-- Core tables for conversation management

-- Create threads table
CREATE TABLE IF NOT EXISTS public.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  messages_from_user INTEGER DEFAULT 0,
  messages_from_lead INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_from VARCHAR(20), -- 'user' or 'lead'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, lead_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
  content TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'failed', 'pending'
  channel VARCHAR(20) DEFAULT 'sms', -- 'sms' or 'email'
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_lead_id ON public.threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_message ON public.threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON public.messages(scheduled_for) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for threads
CREATE POLICY "Users can view their own threads"
  ON public.threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own threads"
  ON public.threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own threads"
  ON public.threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own threads"
  ON public.threads FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = user_id);

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION public.update_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON public.threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_threads_updated_at();

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_threads_updated_at();

-- Function to update thread stats when a message is created
CREATE OR REPLACE FUNCTION public.update_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.threads
  SET
    messages_from_user = CASE
      WHEN NEW.direction = 'outbound' THEN messages_from_user + 1
      ELSE messages_from_user
    END,
    messages_from_lead = CASE
      WHEN NEW.direction = 'inbound' THEN messages_from_lead + 1
      ELSE messages_from_lead
    END,
    last_message_at = NEW.created_at,
    last_message_from = CASE
      WHEN NEW.direction = 'outbound' THEN 'user'
      ELSE 'lead'
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_thread_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_on_message();

-- Function to get or create thread for a lead
CREATE OR REPLACE FUNCTION public.get_or_create_thread(
  user_id_param UUID,
  lead_id_param UUID
)
RETURNS UUID AS $$
DECLARE
  thread_id_result UUID;
BEGIN
  -- Try to get existing thread
  SELECT id INTO thread_id_result
  FROM public.threads
  WHERE user_id = user_id_param AND lead_id = lead_id_param;

  -- If thread doesn't exist, create it
  IF thread_id_result IS NULL THEN
    INSERT INTO public.threads (user_id, lead_id)
    VALUES (user_id_param, lead_id_param)
    RETURNING id INTO thread_id_result;
  END IF;

  RETURN thread_id_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.threads IS 'Conversation threads between users and leads';
COMMENT ON TABLE public.messages IS 'Individual messages within threads';
COMMENT ON COLUMN public.threads.messages_from_user IS 'Count of messages sent by user';
COMMENT ON COLUMN public.threads.messages_from_lead IS 'Count of messages received from lead';
COMMENT ON COLUMN public.messages.scheduled_for IS 'When to send this message (null = send immediately)';
COMMENT ON FUNCTION public.get_or_create_thread IS 'Gets existing thread or creates new one for a user-lead pair';

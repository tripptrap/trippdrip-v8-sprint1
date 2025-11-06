-- Conversation Management Enhancement
-- Adds archiving and tagging capabilities to threads

-- Add archived column to threads table
ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS conversation_tags TEXT[] DEFAULT '{}';

-- Create index for archived threads
CREATE INDEX IF NOT EXISTS idx_threads_archived ON public.threads(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_threads_tags ON public.threads USING GIN(conversation_tags);

-- Create conversation_tags table for tag management
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_conversation_tags_user_id ON public.conversation_tags(user_id);

-- Enable RLS
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_tags
CREATE POLICY "Users can view their own conversation tags"
  ON public.conversation_tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversation tags"
  ON public.conversation_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation tags"
  ON public.conversation_tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversation tags"
  ON public.conversation_tags FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_tags_updated_at
  BEFORE UPDATE ON public.conversation_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_tags_updated_at();

-- Function to archive a thread
CREATE OR REPLACE FUNCTION public.archive_thread(thread_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.threads
  SET is_archived = true,
      archived_at = NOW(),
      updated_at = NOW()
  WHERE id = thread_id_param
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unarchive a thread
CREATE OR REPLACE FUNCTION public.unarchive_thread(thread_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.threads
  SET is_archived = false,
      archived_at = NULL,
      updated_at = NOW()
  WHERE id = thread_id_param
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add tag to thread
CREATE OR REPLACE FUNCTION public.add_thread_tag(thread_id_param UUID, tag_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.threads
  SET conversation_tags = array_append(conversation_tags, tag_name),
      updated_at = NOW()
  WHERE id = thread_id_param
    AND user_id = auth.uid()
    AND NOT (tag_name = ANY(conversation_tags)); -- Prevent duplicates

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove tag from thread
CREATE OR REPLACE FUNCTION public.remove_thread_tag(thread_id_param UUID, tag_name VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.threads
  SET conversation_tags = array_remove(conversation_tags, tag_name),
      updated_at = NOW()
  WHERE id = thread_id_param
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk archive threads
CREATE OR REPLACE FUNCTION public.bulk_archive_threads(thread_ids UUID[])
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.threads
  SET is_archived = true,
      archived_at = NOW(),
      updated_at = NOW()
  WHERE id = ANY(thread_ids)
    AND user_id = auth.uid();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get tag usage stats
CREATE OR REPLACE FUNCTION public.get_tag_usage_stats(user_id_param UUID)
RETURNS TABLE (
  tag_name TEXT,
  usage_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    unnest(conversation_tags) as tag_name,
    COUNT(*) as usage_count
  FROM public.threads
  WHERE user_id = user_id_param
    AND conversation_tags IS NOT NULL
    AND array_length(conversation_tags, 1) > 0
  GROUP BY tag_name
  ORDER BY usage_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.conversation_tags IS 'User-defined tags for organizing conversations';
COMMENT ON COLUMN public.threads.is_archived IS 'Whether the conversation is archived (hidden from main view)';
COMMENT ON COLUMN public.threads.conversation_tags IS 'Array of tag names applied to this conversation';
COMMENT ON FUNCTION public.archive_thread IS 'Archives a single thread';
COMMENT ON FUNCTION public.bulk_archive_threads IS 'Archives multiple threads at once';
COMMENT ON FUNCTION public.get_tag_usage_stats IS 'Returns tag usage statistics for a user';

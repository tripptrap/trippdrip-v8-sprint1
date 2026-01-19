-- Add campaign_id to threads table to track campaign-originated conversations
-- This allows filtering between individual conversations and campaign bulk sends

-- Add campaign_id column to threads
ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_threads_campaign_id ON public.threads(campaign_id);

-- Comment explaining the field
COMMENT ON COLUMN public.threads.campaign_id IS 'ID of campaign that initiated this thread (null for individual messages)';

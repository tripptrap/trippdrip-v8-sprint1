-- Lead Notes and Activity History Table
-- Run this in your Supabase SQL Editor

-- Create lead_notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  note_type VARCHAR(50) NOT NULL DEFAULT 'note', -- 'note', 'call', 'email', 'meeting', 'sms', 'status_change', 'disposition_change'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Store additional data like old_value, new_value for changes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_user_id ON public.lead_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON public.lead_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_type ON public.lead_notes(note_type);

-- Enable Row Level Security
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own notes
CREATE POLICY "Users can view their own lead notes"
  ON public.lead_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own notes
CREATE POLICY "Users can create their own lead notes"
  ON public.lead_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update their own lead notes"
  ON public.lead_notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete their own lead notes"
  ON public.lead_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_lead_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER update_lead_notes_updated_at
  BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_notes_updated_at();

-- Function to auto-create activity logs for status/disposition changes
-- This can be called from your API when updating leads
CREATE OR REPLACE FUNCTION public.log_lead_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_notes (user_id, lead_id, note_type, content, metadata)
    VALUES (
      NEW.user_id,
      NEW.id,
      'status_change',
      'Status changed from "' || COALESCE(OLD.status, 'none') || '" to "' || COALESCE(NEW.status, 'none') || '"',
      jsonb_build_object('old_value', OLD.status, 'new_value', NEW.status, 'auto_generated', true)
    );
  END IF;

  -- Log disposition changes
  IF OLD.disposition IS DISTINCT FROM NEW.disposition THEN
    INSERT INTO public.lead_notes (user_id, lead_id, note_type, content, metadata)
    VALUES (
      NEW.user_id,
      NEW.id,
      'disposition_change',
      'Disposition changed from "' || COALESCE(OLD.disposition, 'none') || '" to "' || COALESCE(NEW.disposition, 'none') || '"',
      jsonb_build_object('old_value', OLD.disposition, 'new_value', NEW.disposition, 'auto_generated', true)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic logging (optional - comment out if you prefer manual logging)
CREATE TRIGGER log_lead_changes
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_change();

COMMENT ON TABLE public.lead_notes IS 'Stores notes and activity history for leads';
COMMENT ON COLUMN public.lead_notes.note_type IS 'Type of note: note, call, email, meeting, sms, status_change, disposition_change';
COMMENT ON COLUMN public.lead_notes.metadata IS 'Additional data in JSON format, e.g., old/new values for changes';

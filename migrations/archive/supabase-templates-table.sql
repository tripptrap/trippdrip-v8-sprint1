-- Message Templates Table
-- Run this in your Supabase SQL Editor

-- Create message_templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT 'general', -- 'general', 'follow_up', 'introduction', 'closing', 'objection_handling', etc.
  content TEXT NOT NULL,
  channel VARCHAR(20) DEFAULT 'sms', -- 'sms', 'email', 'both'
  subject VARCHAR(500), -- For email templates
  variables JSONB DEFAULT '[]', -- Array of variable names used in template e.g., ["first_name", "company"]
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.message_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_channel ON public.message_templates(channel);
CREATE INDEX IF NOT EXISTS idx_templates_favorite ON public.message_templates(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_templates_use_count ON public.message_templates(use_count DESC);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own templates"
  ON public.message_templates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
  ON public.message_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON public.message_templates
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON public.message_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_templates_updated_at();

-- Function to extract variables from template content
CREATE OR REPLACE FUNCTION public.extract_template_variables(content TEXT)
RETURNS JSONB AS $$
DECLARE
  variables TEXT[];
  var TEXT;
BEGIN
  -- Find all {variable_name} patterns
  variables := ARRAY(
    SELECT DISTINCT match[1]
    FROM regexp_matches(content, '\{([a-zA-Z_][a-zA-Z0-9_]*)\}', 'g') AS match
  );

  RETURN to_jsonb(variables);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-extract variables when template is created/updated
CREATE OR REPLACE FUNCTION public.auto_extract_template_variables()
RETURNS TRIGGER AS $$
BEGIN
  NEW.variables = extract_template_variables(NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_extract_variables
  BEFORE INSERT OR UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_extract_template_variables();

-- Insert some default templates
INSERT INTO public.message_templates (user_id, name, category, content, channel) VALUES
-- Get first user ID (you can adjust this or run manually for each user)
((SELECT id FROM auth.users LIMIT 1), 'Introduction', 'introduction', 'Hi {first_name}! This is {agent_name} from {company}. I wanted to reach out about {topic}. Do you have a few minutes to chat?', 'sms'),
((SELECT id FROM auth.users LIMIT 1), 'Follow-up', 'follow_up', 'Hi {first_name}, following up on my previous message. Are you still interested in {topic}? Let me know if you have any questions!', 'sms'),
((SELECT id FROM auth.users LIMIT 1), 'Thank You', 'closing', 'Thanks for your time today, {first_name}! Looking forward to working with you. Feel free to reach out anytime.', 'sms'),
((SELECT id FROM auth.users LIMIT 1), 'Appointment Reminder', 'general', 'Hi {first_name}! Just a reminder about our appointment on {date} at {time}. See you then!', 'sms'),
((SELECT id FROM auth.users LIMIT 1), 'Check-in', 'follow_up', 'Hey {first_name}! Just checking in. How are things going with {topic}? Let me know if you need anything.', 'sms')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.message_templates IS 'Stores reusable message templates with variable substitution';
COMMENT ON COLUMN public.message_templates.variables IS 'Automatically extracted variables from content in format: ["first_name", "company"]';
COMMENT ON COLUMN public.message_templates.use_count IS 'Tracks how many times template has been used';

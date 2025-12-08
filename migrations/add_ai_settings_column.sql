-- Add ai_settings column to existing user_settings table
-- Run this in Supabase SQL Editor

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{
  "modelVersion": "v1",
  "v2CustomPrompt": "",
  "v2ModelSettings": {
    "temperature": 0.7,
    "maxTokens": 150,
    "presencePenalty": 0.0,
    "frequencyPenalty": 0.0
  }
}'::jsonb;

COMMENT ON COLUMN user_settings.ai_settings IS 'JSONB containing AI model settings (version, prompts, model params)';

SELECT 'ai_settings column added successfully!' as status;

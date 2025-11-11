-- Check what tables exist and their columns
-- Run this in Supabase SQL Editor

-- Check if tables exist
SELECT
  table_name,
  CASE
    WHEN table_name = 'leads' THEN '✅'
    WHEN table_name = 'lead_activities' THEN '✅'
    WHEN table_name = 'sms_messages' THEN '✅'
    WHEN table_name = 'sms_templates' THEN '✅'
    WHEN table_name = 'sms_responses' THEN '✅'
    WHEN table_name = 'campaigns' THEN '✅'
    WHEN table_name = 'messages' THEN '✅'
    WHEN table_name = 'threads' THEN '✅'
    ELSE ''
  END as exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('leads', 'lead_activities', 'sms_messages', 'sms_templates', 'sms_responses', 'campaigns', 'messages', 'threads')
ORDER BY table_name;

-- Check lead_activities columns specifically
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'lead_activities'
ORDER BY ordinal_position;

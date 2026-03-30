-- Add pending_ai_draft column to threads table for "suggest" autonomy mode
ALTER TABLE threads ADD COLUMN IF NOT EXISTS pending_ai_draft TEXT;

-- Add industry tone fields to receptionist_settings table
-- Enables per-industry AI tone selection using existing presets

ALTER TABLE receptionist_settings ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT NULL;
ALTER TABLE receptionist_settings ADD COLUMN IF NOT EXISTS use_industry_preset BOOLEAN DEFAULT true;

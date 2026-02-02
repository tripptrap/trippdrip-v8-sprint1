-- Standardize subscription tier naming: growth/scale/unpaid
-- Run this migration to update all existing tier values

-- Step 1: Update existing tier values
UPDATE users SET subscription_tier = 'growth' WHERE subscription_tier IN ('starter', 'basic');
UPDATE users SET subscription_tier = 'scale' WHERE subscription_tier IN ('professional', 'premium');
UPDATE users SET subscription_tier = 'unpaid' WHERE subscription_tier IN ('preview', 'free') OR subscription_tier IS NULL;

-- Step 2: Drop existing CHECK constraint if it exists (safe to run even if none exists)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

-- Step 3: Add new CHECK constraint
ALTER TABLE users ADD CONSTRAINT users_subscription_tier_check
  CHECK (subscription_tier IN ('unpaid', 'growth', 'scale'));

-- Step 4: Set default to 'unpaid'
ALTER TABLE users ALTER COLUMN subscription_tier SET DEFAULT 'unpaid';

-- Migration: Add tag ordering, tag groups, and auto-tagging rules
-- Date: 2024-02-03

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ADD POSITION FIELD TO TAGS FOR ORDERING
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tags ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Set initial positions based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
  FROM tags
)
UPDATE tags SET position = numbered.rn
FROM numbered WHERE tags.id = numbered.id;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_tags_position ON tags(user_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CREATE TAG_GROUPS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tag_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  tag_names TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own tag_groups"
  ON tag_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tag_groups"
  ON tag_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tag_groups"
  ON tag_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tag_groups"
  ON tag_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_tag_groups_user_id ON tag_groups(user_id);

-- Add trigger to update updated_at
CREATE TRIGGER update_tag_groups_updated_at
  BEFORE UPDATE ON tag_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CREATE AUTO_TAGGING_RULES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auto_tagging_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,

  -- Trigger conditions
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'lead_created',
    'message_received',
    'message_sent',
    'appointment_booked',
    'no_response',
    'keyword_match',
    'lead_replied'
  )),

  -- Trigger configuration (JSON for flexibility)
  trigger_config JSONB DEFAULT '{}',
  -- Examples:
  -- keyword_match: { "keywords": ["interested", "yes", "call me"], "match_type": "any" }
  -- no_response: { "days": 3 }
  -- lead_created: { "source": "import" }

  -- Actions
  action_type TEXT NOT NULL CHECK (action_type IN (
    'add_tag',
    'remove_tag',
    'set_primary_tag',
    'replace_tag'
  )),

  -- Tag to apply/remove
  tag_name TEXT NOT NULL,

  -- Optional: only apply if lead has certain existing tags
  condition_tags TEXT[] DEFAULT '{}',
  condition_tags_mode TEXT DEFAULT 'any' CHECK (condition_tags_mode IN ('any', 'all', 'none')),

  -- Priority for rule ordering (lower = higher priority)
  priority INTEGER DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE auto_tagging_rules ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own auto_tagging_rules"
  ON auto_tagging_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own auto_tagging_rules"
  ON auto_tagging_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own auto_tagging_rules"
  ON auto_tagging_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own auto_tagging_rules"
  ON auto_tagging_rules FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_auto_tagging_rules_user_id ON auto_tagging_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_tagging_rules_trigger ON auto_tagging_rules(user_id, trigger_type, enabled);

-- Add trigger to update updated_at
CREATE TRIGGER update_auto_tagging_rules_updated_at
  BEFORE UPDATE ON auto_tagging_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. HELPER FUNCTION TO EXECUTE AUTO-TAGGING RULES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION execute_auto_tagging_rule(
  p_user_id UUID,
  p_lead_id UUID,
  p_trigger_type TEXT,
  p_trigger_data JSONB DEFAULT '{}'
) RETURNS TABLE(rule_id UUID, rule_name TEXT, action_taken TEXT) AS $$
DECLARE
  rule RECORD;
  lead_tags TEXT[];
  matches_condition BOOLEAN;
BEGIN
  -- Get current lead tags
  SELECT tags INTO lead_tags FROM leads WHERE id = p_lead_id AND user_id = p_user_id;
  IF lead_tags IS NULL THEN lead_tags := '{}'; END IF;

  -- Find matching rules
  FOR rule IN
    SELECT * FROM auto_tagging_rules
    WHERE user_id = p_user_id
      AND trigger_type = p_trigger_type
      AND enabled = true
    ORDER BY priority ASC
  LOOP
    -- Check condition tags
    matches_condition := CASE rule.condition_tags_mode
      WHEN 'any' THEN
        ARRAY_LENGTH(rule.condition_tags, 1) IS NULL OR
        lead_tags && rule.condition_tags
      WHEN 'all' THEN
        ARRAY_LENGTH(rule.condition_tags, 1) IS NULL OR
        rule.condition_tags <@ lead_tags
      WHEN 'none' THEN
        NOT (lead_tags && rule.condition_tags)
      ELSE true
    END;

    IF matches_condition THEN
      -- Execute action
      CASE rule.action_type
        WHEN 'add_tag' THEN
          IF NOT rule.tag_name = ANY(lead_tags) THEN
            UPDATE leads SET tags = array_append(tags, rule.tag_name)
            WHERE id = p_lead_id AND user_id = p_user_id;
            RETURN QUERY SELECT rule.id, rule.name, 'added_tag: ' || rule.tag_name;
          END IF;
        WHEN 'remove_tag' THEN
          IF rule.tag_name = ANY(lead_tags) THEN
            UPDATE leads SET tags = array_remove(tags, rule.tag_name)
            WHERE id = p_lead_id AND user_id = p_user_id;
            RETURN QUERY SELECT rule.id, rule.name, 'removed_tag: ' || rule.tag_name;
          END IF;
        WHEN 'set_primary_tag' THEN
          UPDATE leads SET primary_tag = rule.tag_name,
            tags = CASE WHEN rule.tag_name = ANY(tags) THEN tags ELSE array_append(tags, rule.tag_name) END
          WHERE id = p_lead_id AND user_id = p_user_id;
          RETURN QUERY SELECT rule.id, rule.name, 'set_primary: ' || rule.tag_name;
        WHEN 'replace_tag' THEN
          -- Replace matching condition tags with the new tag
          UPDATE leads SET
            tags = array_append(
              ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest(rule.condition_tags)),
              rule.tag_name
            )
          WHERE id = p_lead_id AND user_id = p_user_id;
          RETURN QUERY SELECT rule.id, rule.name, 'replaced_tags: ' || rule.tag_name;
      END CASE;

      -- Refresh lead_tags for next rule
      SELECT tags INTO lead_tags FROM leads WHERE id = p_lead_id AND user_id = p_user_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

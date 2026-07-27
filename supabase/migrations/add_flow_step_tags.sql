-- AI overhaul baseline (GitHub issue #26): tags become flow-owned steps.
-- A tag can optionally belong to a flow (flow_id), sit at a specific position
-- within that flow's step sequence (flow_step_order), carry its own editable
-- AI instruction for what to ask/say at that step (ai_instruction), and name
-- the field it fills in leads.conversation_state.collectedInfo (field_name).
-- Tags with flow_id IS NULL keep working exactly as before (manual/global tags).

ALTER TABLE tags ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES conversation_flows(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS flow_step_order INTEGER;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS ai_instruction TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS field_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tags_flow_steps
  ON tags(flow_id, flow_step_order)
  WHERE flow_id IS NOT NULL;

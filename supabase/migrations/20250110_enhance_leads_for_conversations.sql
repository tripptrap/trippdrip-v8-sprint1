-- Enhance Leads Table for Conversation Flow Management
-- This migration adds fields needed for:
-- 1. Lead Management System
-- 2. Conversation Recovery
-- 3. SMS Notifications
-- 4. AI Response Quality tracking

-- ============================================
-- 1. ENHANCE LEADS TABLE
-- ============================================

-- Add new columns to leads table
DO $$
BEGIN
  -- Source tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'source') THEN
    ALTER TABLE leads ADD COLUMN source TEXT DEFAULT 'website'; -- website, referral, ad, etc.
  END IF;

  -- Flow tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'flow_id') THEN
    ALTER TABLE leads ADD COLUMN flow_id UUID REFERENCES conversation_flows(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'flow_name') THEN
    ALTER TABLE leads ADD COLUMN flow_name TEXT;
  END IF;

  -- Conversation state (for recovery)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'conversation_state') THEN
    ALTER TABLE leads ADD COLUMN conversation_state JSONB DEFAULT '{}';
    COMMENT ON COLUMN leads.conversation_state IS 'Stores: collectedInfo, conversationHistory, currentStep, lastMessageAt, etc.';
  END IF;

  -- Qualification data
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'qualification_score') THEN
    ALTER TABLE leads ADD COLUMN qualification_score INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'qualified_at') THEN
    ALTER TABLE leads ADD COLUMN qualified_at TIMESTAMPTZ;
  END IF;

  -- Appointment tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'appointment_scheduled') THEN
    ALTER TABLE leads ADD COLUMN appointment_scheduled BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'appointment_at') THEN
    ALTER TABLE leads ADD COLUMN appointment_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'appointment_google_event_id') THEN
    ALTER TABLE leads ADD COLUMN appointment_google_event_id TEXT;
  END IF;

  -- SMS notification tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'sms_opt_in') THEN
    ALTER TABLE leads ADD COLUMN sms_opt_in BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'confirmation_sms_sent') THEN
    ALTER TABLE leads ADD COLUMN confirmation_sms_sent BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'reminder_sms_sent') THEN
    ALTER TABLE leads ADD COLUMN reminder_sms_sent BOOLEAN DEFAULT false;
  END IF;

  -- Engagement tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'last_interaction_at') THEN
    ALTER TABLE leads ADD COLUMN last_interaction_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'interaction_count') THEN
    ALTER TABLE leads ADD COLUMN interaction_count INTEGER DEFAULT 0;
  END IF;

  -- Notes and context
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'notes') THEN
    ALTER TABLE leads ADD COLUMN notes TEXT;
  END IF;

  -- Lifecycle
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'converted') THEN
    ALTER TABLE leads ADD COLUMN converted BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'converted_at') THEN
    ALTER TABLE leads ADD COLUMN converted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'lost') THEN
    ALTER TABLE leads ADD COLUMN lost BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'lost_reason') THEN
    ALTER TABLE leads ADD COLUMN lost_reason TEXT;
  END IF;
END $$;

-- ============================================
-- 2. ADD INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_flow_id ON leads(flow_id);
CREATE INDEX IF NOT EXISTS idx_leads_appointment_at ON leads(appointment_at) WHERE appointment_scheduled = true;
CREATE INDEX IF NOT EXISTS idx_leads_last_interaction ON leads(last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_score ON leads(qualification_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted) WHERE converted = true;

-- ============================================
-- 3. CREATE CONVERSATION_SESSIONS TABLE
-- For tracking individual conversation sessions (supports recovery)
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES conversation_flows(id) ON DELETE SET NULL,

  -- Session state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'recovered')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Conversation data
  collected_info JSONB DEFAULT '{}',
  conversation_history JSONB DEFAULT '[]',
  current_step JSONB,

  -- Progress tracking
  questions_answered INTEGER DEFAULT 0,
  questions_total INTEGER DEFAULT 0,
  completion_percentage INTEGER DEFAULT 0,

  -- Outcome
  appointment_booked BOOLEAN DEFAULT false,
  appointment_time TIMESTAMPTZ,
  google_event_id TEXT,

  -- Recovery
  recovery_link_sent BOOLEAN DEFAULT false,
  recovery_link_sent_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_lead_id ON conversation_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_flow_id ON conversation_sessions(flow_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_status ON conversation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_last_activity ON conversation_sessions(last_activity_at DESC);

-- Enable RLS
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own conversation sessions"
  ON conversation_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversation sessions"
  ON conversation_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversation sessions"
  ON conversation_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversation sessions"
  ON conversation_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_conversation_sessions_updated_at ON conversation_sessions;
CREATE TRIGGER update_conversation_sessions_updated_at
  BEFORE UPDATE ON conversation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. CREATE LEAD_ACTIVITIES TABLE
-- For tracking all interactions with a lead
-- ============================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  -- Activity details
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'conversation_started',
    'question_answered',
    'conversation_completed',
    'conversation_abandoned',
    'appointment_scheduled',
    'appointment_confirmed',
    'appointment_reminded',
    'appointment_completed',
    'appointment_cancelled',
    'sms_sent',
    'email_sent',
    'note_added',
    'status_changed',
    'converted',
    'lost'
  )),

  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_lead_activities_user_id ON lead_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);

-- Enable RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own lead activities"
  ON lead_activities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lead activities"
  ON lead_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead activities"
  ON lead_activities FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 5. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to automatically update lead's last_interaction_at
CREATE OR REPLACE FUNCTION update_lead_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leads
  SET
    last_interaction_at = NOW(),
    interaction_count = interaction_count + 1
  WHERE id = NEW.lead_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for conversation sessions
DROP TRIGGER IF EXISTS trigger_update_lead_on_session_activity ON conversation_sessions;
CREATE TRIGGER trigger_update_lead_on_session_activity
  AFTER INSERT OR UPDATE ON conversation_sessions
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION update_lead_last_interaction();

-- Trigger for lead activities
DROP TRIGGER IF EXISTS trigger_update_lead_on_activity ON lead_activities;
CREATE TRIGGER trigger_update_lead_on_activity
  AFTER INSERT ON lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_last_interaction();

-- ============================================
-- 6. CREATE VIEW FOR LEAD DASHBOARD
-- ============================================
CREATE OR REPLACE VIEW lead_dashboard AS
SELECT
  l.id,
  l.user_id,
  l.first_name,
  l.last_name,
  l.phone,
  l.email,
  l.status,
  l.disposition,
  l.source,
  l.tags,
  l.flow_name,
  l.qualification_score,
  l.appointment_scheduled,
  l.appointment_at,
  l.last_interaction_at,
  l.interaction_count,
  l.converted,
  l.converted_at,
  l.lost,
  l.lost_reason,
  l.created_at,
  l.updated_at,

  -- Aggregated data
  (SELECT COUNT(*) FROM conversation_sessions WHERE lead_id = l.id) as total_sessions,
  (SELECT COUNT(*) FROM conversation_sessions WHERE lead_id = l.id AND status = 'completed') as completed_sessions,
  (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id) as total_activities,

  -- Latest session
  (SELECT status FROM conversation_sessions WHERE lead_id = l.id ORDER BY last_activity_at DESC LIMIT 1) as latest_session_status,
  (SELECT last_activity_at FROM conversation_sessions WHERE lead_id = l.id ORDER BY last_activity_at DESC LIMIT 1) as latest_session_activity
FROM leads l;

-- Grant access to the view
GRANT SELECT ON lead_dashboard TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Migration: Create Clients Table
-- Run this in Supabase SQL Editor

-- 1. CREATE CLIENTS TABLE
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  state TEXT,
  zip_code TEXT,
  tags TEXT[] DEFAULT '{}',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  source TEXT,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  flow_id UUID,
  flow_name TEXT,
  qualification_score INTEGER,
  converted_from_lead_at TIMESTAMPTZ DEFAULT NOW(),
  sold_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ADD client_id TO LEADS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'client_id') THEN
    ALTER TABLE leads ADD COLUMN client_id UUID;
  END IF;
END $$;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_tags ON clients USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_clients_campaign_id ON clients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clients_original_lead_id ON clients(original_lead_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);

-- 4. ROW LEVEL SECURITY
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients"
  ON clients FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients"
  ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON clients FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON clients FOR DELETE USING (auth.uid() = user_id);

-- 5. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clients_updated_at ON clients;
CREATE TRIGGER trigger_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at();

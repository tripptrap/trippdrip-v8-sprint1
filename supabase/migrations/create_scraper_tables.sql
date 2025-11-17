-- Web Scraper Tables
-- Similar to Octoparse functionality

-- Scraper configurations/templates
CREATE TABLE IF NOT EXISTS scraper_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Target configuration
  start_url TEXT NOT NULL,
  target_domain TEXT NOT NULL,

  -- Scraping rules (JSON structure for selectors)
  extraction_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "fields": [
  --     {"name": "name", "selector": ".profile-name", "type": "text"},
  --     {"name": "email", "selector": ".contact-email", "type": "text"},
  --     {"name": "phone", "selector": ".phone", "type": "text"}
  --   ],
  --   "pagination": {"selector": ".next-page", "type": "link"},
  --   "maxPages": 10
  -- }

  -- Scraping settings
  settings JSONB DEFAULT '{
    "maxPages": 10,
    "delay": 2000,
    "respectRobots": true,
    "userAgent": "HyveWyre Scraper Bot/1.0",
    "timeout": 30000,
    "retries": 3
  }'::jsonb,

  -- Scheduling
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_frequency TEXT, -- 'hourly', 'daily', 'weekly', 'monthly'
  schedule_time TIME,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  is_template BOOLEAN DEFAULT false, -- Pre-built templates
  template_category TEXT, -- 'real-estate', 'social-media', 'business-directory', etc.

  -- Stats
  total_runs INTEGER DEFAULT 0,
  total_records_scraped INTEGER DEFAULT 0,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scraped data records
CREATE TABLE IF NOT EXISTS scraped_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scraper_config_id UUID NOT NULL REFERENCES scraper_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scraped data (flexible JSON structure)
  data JSONB NOT NULL,
  -- Example: {"name": "John Doe", "email": "john@example.com", "phone": "+1234567890"}

  -- Source information
  source_url TEXT NOT NULL,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Processing status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'converted', 'duplicate', 'invalid', 'ignored')),
  converted_to_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Data quality
  confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 0.0 to 1.0
  is_validated BOOLEAN DEFAULT false,
  validation_errors JSONB,

  -- Duplicate detection
  duplicate_hash TEXT, -- Hash of key fields for duplicate detection

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scraper run logs/history
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scraper_config_id UUID NOT NULL REFERENCES scraper_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Run details
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Results
  records_found INTEGER DEFAULT 0,
  records_new INTEGER DEFAULT 0,
  records_duplicate INTEGER DEFAULT 0,
  records_invalid INTEGER DEFAULT 0,
  pages_scraped INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  error_details JSONB,

  -- Performance metrics
  duration_ms INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraper_configs_user ON scraper_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_status ON scraper_configs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_schedule ON scraper_configs(schedule_enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_template ON scraper_configs(is_template, template_category);

CREATE INDEX IF NOT EXISTS idx_scraped_data_config ON scraped_data(scraper_config_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_user ON scraped_data(user_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_status ON scraped_data(status);
CREATE INDEX IF NOT EXISTS idx_scraped_data_hash ON scraped_data(duplicate_hash);
CREATE INDEX IF NOT EXISTS idx_scraped_data_created ON scraped_data(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_config ON scraper_runs(scraper_config_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_user ON scraper_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON scraper_runs(status);

-- RLS Policies
ALTER TABLE scraper_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own scraper configs
CREATE POLICY "Users can view their own scraper configs"
  ON scraper_configs FOR SELECT
  USING (user_id = auth.uid() OR is_template = true);

CREATE POLICY "Users can create their own scraper configs"
  ON scraper_configs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own scraper configs"
  ON scraper_configs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own scraper configs"
  ON scraper_configs FOR DELETE
  USING (user_id = auth.uid());

-- Users can only see their own scraped data
CREATE POLICY "Users can view their own scraped data"
  ON scraped_data FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own scraped data"
  ON scraped_data FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own scraped data"
  ON scraped_data FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own scraped data"
  ON scraped_data FOR DELETE
  USING (user_id = auth.uid());

-- Users can only see their own scraper runs
CREATE POLICY "Users can view their own scraper runs"
  ON scraper_runs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own scraper runs"
  ON scraper_runs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Comments
COMMENT ON TABLE scraper_configs IS 'Web scraper configurations and templates';
COMMENT ON TABLE scraped_data IS 'Data extracted from web scraping';
COMMENT ON TABLE scraper_runs IS 'History and logs of scraper executions';

COMMENT ON COLUMN scraper_configs.extraction_rules IS 'JSON structure defining what data to extract and how';
COMMENT ON COLUMN scraper_configs.settings IS 'Scraper behavior settings (delays, timeouts, etc)';
COMMENT ON COLUMN scraped_data.duplicate_hash IS 'Hash of key fields for detecting duplicates';
COMMENT ON COLUMN scraped_data.confidence_score IS 'Data quality confidence score (0.0-1.0)';

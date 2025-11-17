-- Enterprise DNC (Do Not Call) List
-- Compliance system to track and respect opt-outs

-- DNC List Table
CREATE TABLE IF NOT EXISTS public.dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  normalized_phone VARCHAR(20) NOT NULL, -- E.164 format for matching
  reason VARCHAR(50) DEFAULT 'manual', -- manual, opt_out, complaint, legal
  source VARCHAR(100), -- Where the opt-out came from
  notes TEXT,
  added_by VARCHAR(50) DEFAULT 'user', -- user, system, admin
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent duplicate entries per user
  UNIQUE(user_id, normalized_phone)
);

-- Global/Enterprise DNC List (shared across all users)
CREATE TABLE IF NOT EXISTS public.dnc_global (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  normalized_phone VARCHAR(20) NOT NULL UNIQUE,
  reason VARCHAR(50) DEFAULT 'complaint',
  source VARCHAR(100),
  notes TEXT,
  complaint_count INTEGER DEFAULT 1,
  last_complaint_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DNC History/Audit Log
CREATE TABLE IF NOT EXISTS public.dnc_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  normalized_phone VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL, -- added, removed, checked, blocked
  list_type VARCHAR(20) NOT NULL, -- user, global
  result BOOLEAN, -- For check actions
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dnc_list_user_id ON public.dnc_list(user_id);
CREATE INDEX IF NOT EXISTS idx_dnc_list_normalized_phone ON public.dnc_list(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_dnc_list_phone_number ON public.dnc_list(phone_number);
CREATE INDEX IF NOT EXISTS idx_dnc_global_normalized_phone ON public.dnc_global(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_dnc_history_user_id ON public.dnc_history(user_id);
CREATE INDEX IF NOT EXISTS idx_dnc_history_phone ON public.dnc_history(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_dnc_history_created_at ON public.dnc_history(created_at);

-- Enable RLS
ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dnc_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dnc_list
CREATE POLICY "Users can view their own DNC entries"
  ON public.dnc_list FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own DNC list"
  ON public.dnc_list FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own DNC entries"
  ON public.dnc_list FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own DNC entries"
  ON public.dnc_list FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for dnc_global (read-only for users)
CREATE POLICY "Users can view global DNC list"
  ON public.dnc_global FOR SELECT
  USING (true);

CREATE POLICY "Only system can modify global DNC"
  ON public.dnc_global FOR ALL
  USING (false);

-- RLS Policies for dnc_history
CREATE POLICY "Users can view their own DNC history"
  ON public.dnc_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert DNC history"
  ON public.dnc_history FOR INSERT
  WITH CHECK (true);

-- Function to normalize phone number to E.164 format
CREATE OR REPLACE FUNCTION public.normalize_phone(phone_input VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  clean_phone VARCHAR;
BEGIN
  -- Remove all non-numeric characters
  clean_phone := regexp_replace(phone_input, '[^0-9]', '', 'g');

  -- If starts with 1 and is 11 digits, return as +1XXXXXXXXXX
  IF length(clean_phone) = 11 AND left(clean_phone, 1) = '1' THEN
    RETURN '+' || clean_phone;
  END IF;

  -- If 10 digits, assume US number and add +1
  IF length(clean_phone) = 10 THEN
    RETURN '+1' || clean_phone;
  END IF;

  -- If already has country code, add +
  IF length(clean_phone) >= 10 THEN
    RETURN '+' || clean_phone;
  END IF;

  -- Return as-is if can't normalize
  RETURN phone_input;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if phone number is on DNC list
CREATE OR REPLACE FUNCTION public.check_dnc(
  p_user_id UUID,
  p_phone_number VARCHAR
)
RETURNS JSON AS $$
DECLARE
  v_normalized VARCHAR;
  v_on_user_list BOOLEAN;
  v_on_global_list BOOLEAN;
  v_reason VARCHAR;
  v_source VARCHAR;
BEGIN
  -- Normalize phone number
  v_normalized := public.normalize_phone(p_phone_number);

  -- Check user's DNC list
  SELECT EXISTS(
    SELECT 1 FROM public.dnc_list
    WHERE user_id = p_user_id
      AND normalized_phone = v_normalized
  ) INTO v_on_user_list;

  -- Check global DNC list
  SELECT EXISTS(
    SELECT 1 FROM public.dnc_global
    WHERE normalized_phone = v_normalized
  ) INTO v_on_global_list;

  -- Get reason if on list
  IF v_on_user_list THEN
    SELECT reason, source INTO v_reason, v_source
    FROM public.dnc_list
    WHERE user_id = p_user_id
      AND normalized_phone = v_normalized
    LIMIT 1;
  ELSIF v_on_global_list THEN
    SELECT reason, source INTO v_reason, v_source
    FROM public.dnc_global
    WHERE normalized_phone = v_normalized
    LIMIT 1;
  END IF;

  -- Log the check
  INSERT INTO public.dnc_history (
    user_id,
    phone_number,
    normalized_phone,
    action,
    list_type,
    result,
    metadata
  ) VALUES (
    p_user_id,
    p_phone_number,
    v_normalized,
    'checked',
    CASE
      WHEN v_on_user_list THEN 'user'
      WHEN v_on_global_list THEN 'global'
      ELSE 'none'
    END,
    v_on_user_list OR v_on_global_list,
    json_build_object(
      'reason', v_reason,
      'source', v_source
    )
  );

  RETURN json_build_object(
    'on_dnc_list', v_on_user_list OR v_on_global_list,
    'on_user_list', v_on_user_list,
    'on_global_list', v_on_global_list,
    'normalized_phone', v_normalized,
    'reason', v_reason,
    'source', v_source
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add phone to DNC list
CREATE OR REPLACE FUNCTION public.add_to_dnc(
  p_user_id UUID,
  p_phone_number VARCHAR,
  p_reason VARCHAR DEFAULT 'manual',
  p_source VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_normalized VARCHAR;
  v_existing_id UUID;
BEGIN
  -- Normalize phone number
  v_normalized := public.normalize_phone(p_phone_number);

  -- Check if already exists
  SELECT id INTO v_existing_id
  FROM public.dnc_list
  WHERE user_id = p_user_id
    AND normalized_phone = v_normalized;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing entry
    UPDATE public.dnc_list
    SET reason = p_reason,
        source = p_source,
        notes = p_notes,
        updated_at = now()
    WHERE id = v_existing_id;

    -- Log the update
    INSERT INTO public.dnc_history (
      user_id,
      phone_number,
      normalized_phone,
      action,
      list_type,
      metadata
    ) VALUES (
      p_user_id,
      p_phone_number,
      v_normalized,
      'updated',
      'user',
      json_build_object('reason', p_reason, 'source', p_source)
    );

    RETURN json_build_object(
      'success', true,
      'action', 'updated',
      'id', v_existing_id,
      'normalized_phone', v_normalized
    );
  ELSE
    -- Insert new entry
    INSERT INTO public.dnc_list (
      user_id,
      phone_number,
      normalized_phone,
      reason,
      source,
      notes
    ) VALUES (
      p_user_id,
      p_phone_number,
      v_normalized,
      p_reason,
      p_source,
      p_notes
    ) RETURNING id INTO v_existing_id;

    -- Log the addition
    INSERT INTO public.dnc_history (
      user_id,
      phone_number,
      normalized_phone,
      action,
      list_type,
      metadata
    ) VALUES (
      p_user_id,
      p_phone_number,
      v_normalized,
      'added',
      'user',
      json_build_object('reason', p_reason, 'source', p_source)
    );

    RETURN json_build_object(
      'success', true,
      'action', 'added',
      'id', v_existing_id,
      'normalized_phone', v_normalized
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove phone from DNC list
CREATE OR REPLACE FUNCTION public.remove_from_dnc(
  p_user_id UUID,
  p_phone_number VARCHAR
)
RETURNS JSON AS $$
DECLARE
  v_normalized VARCHAR;
  v_deleted_count INTEGER;
BEGIN
  -- Normalize phone number
  v_normalized := public.normalize_phone(p_phone_number);

  -- Delete from user's DNC list
  DELETE FROM public.dnc_list
  WHERE user_id = p_user_id
    AND normalized_phone = v_normalized;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    -- Log the removal
    INSERT INTO public.dnc_history (
      user_id,
      phone_number,
      normalized_phone,
      action,
      list_type
    ) VALUES (
      p_user_id,
      p_phone_number,
      v_normalized,
      'removed',
      'user'
    );

    RETURN json_build_object(
      'success', true,
      'removed', true,
      'normalized_phone', v_normalized
    );
  ELSE
    RETURN json_build_object(
      'success', false,
      'removed', false,
      'error', 'Phone number not found in DNC list'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get DNC statistics
CREATE OR REPLACE FUNCTION public.get_dnc_stats(
  p_user_id UUID
)
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'total_user_dnc', (
      SELECT COUNT(*) FROM public.dnc_list
      WHERE user_id = p_user_id
    ),
    'total_global_dnc', (
      SELECT COUNT(*) FROM public.dnc_global
    ),
    'by_reason', (
      SELECT json_object_agg(reason, count)
      FROM (
        SELECT reason, COUNT(*) as count
        FROM public.dnc_list
        WHERE user_id = p_user_id
        GROUP BY reason
      ) reason_counts
    ),
    'recent_additions', (
      SELECT json_agg(
        json_build_object(
          'phone_number', phone_number,
          'reason', reason,
          'source', source,
          'created_at', created_at
        ) ORDER BY created_at DESC
      )
      FROM (
        SELECT * FROM public.dnc_list
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 10
      ) recent
    ),
    'checks_last_30_days', (
      SELECT COUNT(*) FROM public.dnc_history
      WHERE user_id = p_user_id
        AND action = 'checked'
        AND created_at >= now() - INTERVAL '30 days'
    ),
    'blocked_last_30_days', (
      SELECT COUNT(*) FROM public.dnc_history
      WHERE user_id = p_user_id
        AND action = 'checked'
        AND result = true
        AND created_at >= now() - INTERVAL '30 days'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk add numbers to DNC list
CREATE OR REPLACE FUNCTION public.bulk_add_to_dnc(
  p_user_id UUID,
  p_phone_numbers TEXT[],
  p_reason VARCHAR DEFAULT 'manual',
  p_source VARCHAR DEFAULT 'bulk_import'
)
RETURNS JSON AS $$
DECLARE
  v_phone VARCHAR;
  v_added_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_result JSON;
BEGIN
  FOREACH v_phone IN ARRAY p_phone_numbers
  LOOP
    BEGIN
      v_result := public.add_to_dnc(
        p_user_id,
        v_phone,
        p_reason,
        p_source,
        NULL
      );

      IF (v_result->>'action') = 'added' THEN
        v_added_count := v_added_count + 1;
      ELSIF (v_result->>'action') = 'updated' THEN
        v_updated_count := v_updated_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'added', v_added_count,
    'updated', v_updated_count,
    'failed', v_failed_count,
    'total_processed', array_length(p_phone_numbers, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Close the anonymous read on dnc_global and give it a real write path (#88).
--
-- Two problems on one table:
--
--   1. "Users can view global DNC list" was FOR SELECT to {public} — which
--      includes anon — with USING (true). Verified readable with the public
--      anon key. It returned nothing only because the table was permanently
--      empty. As of #93 it is no longer empty: every account deletion promotes
--      that account's opt-outs into it, so it now accumulates real phone
--      numbers of people who opted out, alongside a free-text reason.
--
--   2. Nothing could write to it deliberately. check_dnc() has always read it;
--      #93 added promotion-on-deletion, but there was still no way for an
--      operator to add a number that must never be contacted by anyone —
--      litigators, repeat complainants, an imported registry.
--
-- Enforcement does not need a client-facing SELECT policy: check_dnc() is
-- SECURITY DEFINER and reads the table with the definer's rights. Nothing in
-- app/, lib/ or components/ selects dnc_global directly — checked.

-- ── 1. No anonymous (or authenticated) reads ────────────────────────────────
-- "Only system can modify global DNC" (ALL, USING false) stays as the deny-all.
-- service_role bypasses RLS entirely, which is how the RPCs below reach it.
DROP POLICY IF EXISTS "Users can view global DNC list" ON public.dnc_global;

-- ── 2. A deliberate write path ──────────────────────────────────────────────
-- As an RPC rather than a direct table write, so normalization lives in one
-- place. check_dnc() matches on `normalized_phone = normalize_phone(input)`;
-- an entry normalized any other way silently fails to block, which is the
-- worst possible outcome for this table.

CREATE OR REPLACE FUNCTION public.add_to_global_dnc(
  p_phone_number text,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized varchar;
  v_id uuid;
  v_existed boolean := false;
BEGIN
  IF p_phone_number IS NULL OR btrim(p_phone_number) = '' THEN
    RAISE EXCEPTION 'add_to_global_dnc: phone number is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same helper check_dnc() uses. Do not inline an alternative.
  v_normalized := public.normalize_phone(p_phone_number);

  IF v_normalized IS NULL OR btrim(v_normalized) = '' THEN
    RAISE EXCEPTION 'add_to_global_dnc: % could not be normalised to a usable number', p_phone_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_id FROM public.dnc_global WHERE normalized_phone = v_normalized;

  IF v_id IS NOT NULL THEN
    v_existed := true;
  ELSE
    INSERT INTO public.dnc_global (phone_number, normalized_phone, reason, source, notes)
    VALUES (p_phone_number, v_normalized, COALESCE(p_reason, 'added by operator'), p_source, p_notes)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'normalized_phone', v_normalized,
    'already_present', v_existed
  );
END;
$$;

COMMENT ON FUNCTION public.add_to_global_dnc(text, text, text, text) IS
  'Adds a number to the platform-wide DNC list, normalising it the same way check_dnc() does. Blocks the number for EVERY tenant — see #88.';

CREATE OR REPLACE FUNCTION public.remove_from_global_dnc(p_phone_number text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized varchar;
  v_deleted integer;
BEGIN
  v_normalized := public.normalize_phone(p_phone_number);
  DELETE FROM public.dnc_global WHERE normalized_phone = v_normalized;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.remove_from_global_dnc(text) IS
  'Removes a platform-wide DNC entry. Un-blocking someone who opted out is a compliance decision — the caller must be an operator, and the action should be recorded. See #88.';

-- Operator-only. These block or unblock messaging for every tenant on the
-- platform, so no end user should be able to reach them.
REVOKE ALL ON FUNCTION public.add_to_global_dnc(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_from_global_dnc(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_global_dnc(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_from_global_dnc(text) TO service_role;

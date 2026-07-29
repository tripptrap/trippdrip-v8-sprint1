-- Match a lead by phone regardless of stored format (#95).
--
-- The inbound webhook looked leads up with an exact `phone = from` comparison.
-- Telnyx always delivers E.164 (`+1XXXXXXXXXX`), but `leads.phone` is whatever
-- got imported — 2 of 207 rows were stored as `4079513717` and `18708824134`.
-- Those leads existed and were simply invisible to the lookup, which is why
-- their threads sat with `lead_id NULL`.
--
-- That mattered more once the webhook started *creating* a lead when the lookup
-- found none: an inbound message from a contact whose lead was imported without
-- the +1 would have produced a duplicate lead every time.
--
-- normalize_phone() is the same helper check_dnc() uses, so a number matches
-- here exactly when it matches there.

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_user_id uuid, p_phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_id uuid;
  v_normalized varchar;
BEGIN
  IF p_user_id IS NULL OR p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  v_normalized := public.normalize_phone(p_phone);

  -- Exact match first: it is the common case and uses the existing index.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE user_id = find_lead_by_phone.p_user_id
    AND phone = find_lead_by_phone.p_phone
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    RETURN v_lead_id;
  END IF;

  -- Fall back to comparing normalised forms. Oldest first, so a contact with
  -- accidental duplicates resolves to the original rather than flip-flopping.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE user_id = find_lead_by_phone.p_user_id
    AND public.normalize_phone(phone) = v_normalized
  ORDER BY created_at
  LIMIT 1;

  RETURN v_lead_id;
END;
$$;

COMMENT ON FUNCTION public.find_lead_by_phone(uuid, text) IS
  'Finds a lead by phone for a user, tolerating stored formats that are not E.164. Use instead of an exact phone comparison before creating a lead, or duplicates appear for any lead imported without a +1. See #95.';

REVOKE ALL ON FUNCTION public.find_lead_by_phone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(uuid, text) TO authenticated, service_role;

-- Normalise the one remaining malformed row so exact-match callers elsewhere
-- (several routes still query leads.phone directly) also find it.
UPDATE public.leads
   SET phone = public.normalize_phone(phone), updated_at = now()
 WHERE phone IS NOT NULL
   AND phone NOT LIKE '+%'
   AND public.normalize_phone(phone) IS NOT NULL;

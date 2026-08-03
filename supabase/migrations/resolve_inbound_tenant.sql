-- Which tenant does an inbound message belong to? (#111)
--
-- ── What was wrong ──────────────────────────────────────────────────────────
--
-- The webhook resolved the tenant in three steps. The first is authoritative —
-- the receiving number identifies the account. The other two guess from the
-- SENDER's number, and the handler's own comment says why that is unsafe:
--
--     "Starting with the sender's phone or lead lookup can route to the wrong
--      tenant if two tenants have the same lead."
--
-- Both guesses then used exact string equality. `leads.phone` holds whatever was
-- imported and Telnyx always sends E.164, so a lead stored as `(813) 465-8966`
-- was invisible — the inbound was silently dropped.
--
-- Both also used `.single()`, which errors when more than one row matches. That
-- accidentally avoided misattribution, by dropping the message instead. Fixing
-- only the normalisation would have removed that accident and turned a dropped
-- message into one delivered to the wrong business's inbox.
--
-- ── What this does instead ──────────────────────────────────────────────────
--
-- Two authoritative lookups first, both on the RECEIVING number, which is the
-- only signal that actually identifies an account:
--
--   1. user_telnyx_numbers — any status, not just active. A message to a number
--      that is pending or inactive is still ours, and dropping it is worse than
--      handling it.
--   2. number_pool.assigned_to_user_id — a pool number assigned to a business is
--      equally ours, and this was never consulted at all.
--
-- Then the sender-based guesses, normalised — and **refused when ambiguous**.
-- If two tenants both have that person as a lead, there is no way to know which
-- conversation this belongs to, and picking one puts a consumer's message in
-- another business's inbox. `matched_by` tells the caller how the answer was
-- reached, so a guess can be logged as a guess.

CREATE OR REPLACE FUNCTION public.resolve_inbound_tenant(
  p_to   text,
  p_from text
)
RETURNS TABLE (
  user_id    uuid,
  matched_by text,
  ambiguous  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_to   text := public.normalize_phone(p_to);
  v_from text := public.normalize_phone(p_from);
  v_id   uuid;
  v_n    integer;
BEGIN
  -- 1. The receiving number, active first.
  SELECT n.user_id INTO v_id
    FROM public.user_telnyx_numbers n
   WHERE public.normalize_phone(n.phone_number) = v_to
   ORDER BY (n.status = 'active') DESC, n.created_at
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 'receiving_number'::text, false;
    RETURN;
  END IF;

  -- 2. A pool number assigned to a business. Never consulted before.
  SELECT p.assigned_to_user_id INTO v_id
    FROM public.number_pool p
   WHERE public.normalize_phone(p.phone_number) = v_to
     AND p.assigned_to_user_id IS NOT NULL
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 'pool_number'::text, false;
    RETURN;
  END IF;

  -- 3. An existing conversation with this sender — only if exactly one tenant
  --    has one. More than one and there is no way to know which.
  SELECT count(DISTINCT t.user_id) INTO v_n
    FROM public.threads t
   WHERE public.normalize_phone(t.phone_number) = v_from;

  IF v_n = 1 THEN
    SELECT DISTINCT t.user_id INTO v_id
      FROM public.threads t
     WHERE public.normalize_phone(t.phone_number) = v_from;
    RETURN QUERY SELECT v_id, 'existing_thread'::text, false;
    RETURN;
  ELSIF v_n > 1 THEN
    RETURN QUERY SELECT NULL::uuid, 'existing_thread'::text, true;
    RETURN;
  END IF;

  -- 4. A lead with this number, same rule.
  SELECT count(DISTINCT l.user_id) INTO v_n
    FROM public.leads l
   WHERE public.normalize_phone(l.phone) = v_from;

  IF v_n = 1 THEN
    SELECT DISTINCT l.user_id INTO v_id
      FROM public.leads l
     WHERE public.normalize_phone(l.phone) = v_from;
    RETURN QUERY SELECT v_id, 'lead_phone'::text, false;
    RETURN;
  ELSIF v_n > 1 THEN
    RETURN QUERY SELECT NULL::uuid, 'lead_phone'::text, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, 'none'::text, false;
END;
$$;

COMMENT ON FUNCTION public.resolve_inbound_tenant(text, text) IS
  'Resolves the tenant for an inbound SMS. Prefers the receiving number, which is authoritative; falls back to sender-based matching only when exactly one tenant matches, because guessing puts a consumer message in the wrong business inbox (#111). service_role only.';

REVOKE ALL ON FUNCTION public.resolve_inbound_tenant(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inbound_tenant(text, text) TO service_role;

-- The sender-based steps scan every tenant's rows, so they need functional
-- indexes on the normalised value — the raw-column indexes cannot serve them.
CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone
  ON public.leads (public.normalize_phone(phone))
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_normalized_phone
  ON public.threads (public.normalize_phone(phone_number))
  WHERE phone_number IS NOT NULL;

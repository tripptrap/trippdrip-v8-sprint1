-- Erase a lead's data when they opt out, keeping the suppression record (#109).
--
-- The point of an opt-out is that the person wants nothing further from you.
-- Keeping their name, email, notes and every message they ever sent serves no
-- purpose once you can never contact them again.
--
-- **The one thing that must survive is the `dnc_list` row.** It is what stops
-- the number being messaged again, and it is the evidence you were told to stop.
-- Delete that and the same number comes back in next month's import, gets
-- messaged, and you have no record showing you were ever asked not to — the
-- exact violation the opt-out existed to prevent.
--
-- That works because `dnc_list` is keyed on `(user_id, normalized_phone)` with
-- no reference to the lead, and `check_dnc()` matches on the phone alone. The
-- person is erased; the suppression is not.

CREATE OR REPLACE FUNCTION public.purge_lead_after_opt_out(
  p_user_id uuid,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_id uuid;
  v_normalized varchar;
  v_deleted jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN jsonb_build_object('purged', false, 'reason', 'missing user or phone');
  END IF;

  v_normalized := public.normalize_phone(p_phone);

  -- Refuse to purge unless the suppression is actually recorded. Erasing the
  -- lead while the DNC write failed would leave nothing stopping the next
  -- import from messaging them. Order matters more than anything else here.
  IF NOT EXISTS (
    SELECT 1 FROM public.dnc_list
     WHERE user_id = purge_lead_after_opt_out.p_user_id
       AND normalized_phone = v_normalized
  ) THEN
    RETURN jsonb_build_object('purged', false, 'reason', 'no DNC entry — refusing to erase');
  END IF;

  v_lead_id := public.find_lead_by_phone(p_user_id, p_phone);

  -- Tables that reference leads with ON DELETE SET NULL survive the cascade and
  -- hold message bodies and phone numbers, so they are cleared explicitly —
  -- and *before* the lead, because the cascade nulls the lead_id this needs.
  IF v_lead_id IS NOT NULL THEN
    DELETE FROM public.sms_messages      WHERE lead_id = v_lead_id;
    DELETE FROM public.sms_responses     WHERE lead_id = v_lead_id;
    DELETE FROM public.receptionist_logs WHERE lead_id = v_lead_id;
    DELETE FROM public.emails            WHERE lead_id = v_lead_id;
  END IF;

  -- Also match on the phone: rows written before a lead existed, or after an
  -- earlier purge, carry the number without a lead_id.
  DELETE FROM public.sms_messages
   WHERE user_id = purge_lead_after_opt_out.p_user_id
     AND public.normalize_phone(to_phone) = v_normalized;
  DELETE FROM public.sms_responses
   WHERE user_id = purge_lead_after_opt_out.p_user_id
     AND public.normalize_phone(from_phone) = v_normalized;
  DELETE FROM public.receptionist_logs
   WHERE user_id = purge_lead_after_opt_out.p_user_id
     AND public.normalize_phone(phone_number) = v_normalized;

  -- Deleting the lead cascades the conversation: messages, threads, notes,
  -- activities, follow-ups, drip enrollments, scheduled sends, flows, sessions.
  IF v_lead_id IS NOT NULL THEN
    DELETE FROM public.leads
     WHERE id = v_lead_id AND user_id = purge_lead_after_opt_out.p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := jsonb_set(v_deleted, '{lead}', to_jsonb(v_count));
  END IF;

  -- Threads can outlive a lead when lead_id was never set (#95), so clear any
  -- left on this number.
  DELETE FROM public.threads
   WHERE user_id = purge_lead_after_opt_out.p_user_id
     AND public.normalize_phone(phone_number) = v_normalized;

  -- Deliberately NOT touched:
  --   dnc_list, dnc_history  — the suppression and its audit trail
  --   points_transactions, transactions, payments — financial records have
  --     their own retention requirements (#93)
  --   calendar_events — a booked appointment may still be happening
  --   clients — someone who was converted is a customer, not a lead
  RETURN jsonb_build_object(
    'purged', true,
    'lead_id', v_lead_id,
    'normalized_phone', v_normalized,
    'deleted', v_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.purge_lead_after_opt_out(uuid, text) IS
  'Erases a lead and their conversation after an opt-out, keeping the dnc_list row that enforces and evidences the opt-out (#109). Refuses to run if no DNC entry exists.';

REVOKE ALL ON FUNCTION public.purge_lead_after_opt_out(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_lead_after_opt_out(uuid, text) TO service_role;

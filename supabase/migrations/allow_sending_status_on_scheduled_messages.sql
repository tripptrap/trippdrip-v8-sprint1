-- `sending` is a status the code writes, and the CHECK constraint never allowed it (#61).
--
-- process-scheduled claims a row before sending it — pending -> sending -> sent —
-- so that two concurrent runs cannot both send the same message. That claim has
-- **never once succeeded**: the constraint permitted only
-- ('pending','sent','failed','cancelled'), so every claim failed with 23514 and
-- the message was skipped "to avoid a double send".
--
-- Combined with the SETOF-over-PostgREST fault fixed earlier in #61, this is the
-- second of two independent reasons no automated message has ever gone out. The
-- first stopped the cron finding due rows at all; this one stopped it sending
-- the rows it found. Fixing either alone changes nothing observable, which is
-- part of why it stayed hidden — the fetch fix made the failure *louder* rather
-- than making messages send.
--
-- Verified against the live database before writing this:
--   scheduled_messages_status_check
--     CHECK (status = ANY (ARRAY['pending','sent','failed','cancelled']))
--   statuses actually written by code: pending, sending, sent, failed, cancelled

ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_status_check;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]));

COMMENT ON CONSTRAINT scheduled_messages_status_check ON public.scheduled_messages IS
  'Allowed lifecycle states. `sending` is the claim held between fetch and send; it was missing until #61, which made every claim fail with 23514 and every scheduled message unsendable.';

-- A failed message recorded that it failed and nothing else (audit, 2026-08-03).
--
-- handleDeliveryStatus in the Telnyx webhook wrote `status = 'failed'` and threw
-- `payload.errors` away. So the one field that says WHY -- bad number, carrier
-- block, spam filter, unregistered sender, insufficient balance -- never reached
-- the database.
--
-- These fail in completely different directions and want opposite responses:
--
--   40300 / destination unreachable   the number is bad; stop retrying it
--   40012 / blocked by carrier        content or sender reputation
--   40010 / unregistered sender       10DLC registration, not the message
--
-- Without the code they are one undifferentiated "failed", so nobody can tell a
-- dead phone number from carriers rejecting the whole account -- which is
-- exactly the distinction that matters most right now, given a number was
-- sending unregistered until today.
--
-- Shape follows what Telnyx actually returns and what this codebase already
-- reads elsewhere: `errors: [{ code, title, detail }]`, consumed as
-- `errors?.[0]?.detail` in send-sms, purchase-number, search-numbers and
-- port-number. Same accessor here, so there is one convention.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN public.messages.error_code IS
  'Telnyx error code from the delivery webhook, e.g. 40012. NULL unless status = failed.';
COMMENT ON COLUMN public.messages.error_message IS
  'Human-readable detail from the same Telnyx error. NULL unless status = failed.';

-- Finding the failures, and grouping them by cause, is the whole point.
CREATE INDEX IF NOT EXISTS idx_messages_failed_by_code
  ON public.messages (error_code, created_at DESC)
  WHERE status = 'failed';

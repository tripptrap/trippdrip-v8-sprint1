-- Add columns the application already writes but that were never created.
--
-- Found by the 2026-07-28 audit (#51, #52, #54). In each case the code, and in
-- two cases CLAUDE.md as well, assumed a column that does not exist. Postgres
-- rejects the whole statement, supabase-js returns { error } instead of
-- throwing, and the result was unchecked — so the failure was invisible. Same
-- mechanism as the DNC bug (#34) and user_telnyx_numbers.capabilities.
--
-- Only columns with a real reader are added here. Where nothing reads the value
-- the code was corrected instead, in the same change:
--   - messages.sender        -> dropped (direction already carries this)
--   - messages.segments      -> dropped (nothing reads it off a message row)
--   - messages.credits_cost  -> renamed to the real column, points_cost
--   - messages.from_number / to_number / telnyx_message_id
--                            -> renamed to from_phone / to_phone / message_sid
--   - points_transactions.balance_after      -> dropped (written, never read)
--   - points_transactions.stripe_payment_intent
--                            -> uses stripe_session_id, which already stores
--                               both checkout session ids and invoice ids, and
--                               carries the partial unique index that provides
--                               webhook idempotency
--
-- FKs are safe to add: scheduled_messages and flow_completion_log are both
-- empty, and user_preferences gains only nullable columns.

-- ── #54: scheduled_messages ─────────────────────────────────────────────────
-- `source` is read by /api/messages/schedule, which counts pending messages by
-- manual/drip/campaign/bulk for the UI. Without the column the insert failed,
-- so scheduling has never worked and the table has 0 rows.
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_campaign
  ON public.scheduled_messages(campaign_id);

COMMENT ON COLUMN public.scheduled_messages.source IS
  'How the message was queued: manual | drip | campaign | bulk. Read by /api/messages/schedule for the pending-by-source breakdown.';

-- ── #51: flow_completion_log ────────────────────────────────────────────────
-- /api/conversations/completion-stats groups by flow_id, so per-flow stats need
-- the column. Without it, every insert failed and the table has 0 rows, leaving
-- completion analytics permanently empty.
ALTER TABLE public.flow_completion_log
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.conversation_flows(id) ON DELETE SET NULL;

ALTER TABLE public.flow_completion_log
  ADD COLUMN IF NOT EXISTS completion_type TEXT;

CREATE INDEX IF NOT EXISTS idx_flow_completion_log_flow
  ON public.flow_completion_log(flow_id);

-- campaign_id was NOT NULL, but a flow completion doesn't require a campaign —
-- /api/conversations/complete passes `session.campaign_id || null`, so any
-- completion outside a campaign hit a 23502 even once the columns above
-- existed. Caught by exercising the insert end-to-end rather than by reading
-- the column list.
ALTER TABLE public.flow_completion_log
  ALTER COLUMN campaign_id DROP NOT NULL;

COMMENT ON COLUMN public.flow_completion_log.completion_type IS
  'How the flow ended (e.g. completed, abandoned, handoff). Written by /api/conversations/complete.';

-- ── #52: user_preferences ───────────────────────────────────────────────────
-- Documented in CLAUDE.md and written by both settings routes, but absent — so
-- saving a booking link silently did nothing and send-calendar-link could never
-- read one back.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS calendar_booking_url TEXT;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS calendar_type TEXT;

COMMENT ON COLUMN public.user_preferences.calendar_type IS
  'Which booking method to offer: calendly | google | both. Read by /api/follow-ups/send-calendar-link.';

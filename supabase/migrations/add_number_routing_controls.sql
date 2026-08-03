-- Per-agent control over which number a message goes out from (#122).
--
-- Two things drove this. First, `selectClosestNumber` was wired into only 2 of
-- 8 send paths, so a Scale agent's extra numbers — bought for local presence —
-- did nothing on drips, scheduled sends, AI follow-ups or reminders. Second,
-- geo-routing is not always what an agent wants: someone who has told their
-- contacts "text me on this number" needs it to stay put.
--
-- Three controls, deliberately separate because they answer different questions:
--
--   number_selection_mode  which number should a send prefer?
--   locked_until           don't rotate away from this one for now
--   rested_until           take this one out of rotation entirely for now
--
-- Lock and rest are opposites and both are temporary. Timestamps rather than
-- booleans so they expire on their own — a flag someone has to remember to
-- clear is a flag that stays set.

-- ── Routing mode, per user ──────────────────────────────────────────────────
-- 'geo'     pick the number closest to the lead (default; what Scale pays for)
-- 'primary' always use the primary, whatever it is
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS number_selection_mode text NOT NULL DEFAULT 'geo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_number_selection_mode_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_number_selection_mode_check
      CHECK (number_selection_mode IN ('geo', 'primary'));
  END IF;
END $$;

-- ── Per-number lock and rest ────────────────────────────────────────────────
ALTER TABLE public.user_telnyx_numbers
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS rested_until timestamptz,
  ADD COLUMN IF NOT EXISTS rest_reason  text;

COMMENT ON COLUMN public.user_telnyx_numbers.locked_until IS
  'While set and in the future, routing sticks to this number instead of rotating (#122).';
COMMENT ON COLUMN public.user_telnyx_numbers.rested_until IS
  'While set and in the future, this number is out of rotation — "ghosted" so its carrier reputation can recover (#122).';

-- Resolving a from-number reads every active number for a user on each send, so
-- it is worth an index. `status` is in the predicate because inactive and
-- pending numbers must never be selected.
CREATE INDEX IF NOT EXISTS idx_user_telnyx_numbers_user_status
  ON public.user_telnyx_numbers (user_id, status);

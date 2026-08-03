-- Why a scheduled message is still sitting there (#128).
--
-- ── The problem this fixes ──────────────────────────────────────────────────
--
-- Every automated path distinguishes a permanent block from a retryable one,
-- and handles them correctly: permanent writes `status='failed'` with a reason
-- in `error_message`, retryable leaves the row pending for the next run.
--
-- But retryable writes *nothing*. It logs to the console and continues:
--
--     if (guard.retryable) { console.log(`… deferred …`); continue; }
--
-- So a message pending because the account is rate-capped, or because it is
-- 2am in the recipient's timezone, is **indistinguishable from a cron that
-- never ran** — which is exactly the failure #61 took weeks to find, where the
-- scheduled cron reported success while sending nothing for months.
--
-- The user sees a message that has not gone out and no reason anywhere.
--
-- ── Why two columns rather than reusing error_message ───────────────────────
--
-- `error_message` accompanies `status='failed'` and means "this is over". A
-- deferral is the opposite: the row is healthy and waiting. Writing the reason
-- into `error_message` on a pending row would make a normal quiet-hours wait
-- read as a failure in every list that shows it.
--
-- `last_deferred_at` is separate from `updated_at` because the latter moves for
-- any write. The question being answered is "when did something last stop this
-- from sending", and the gap between that and now is what tells you whether the
-- cron is still running at all.
--
-- Deliberately last-write-wins rather than an append-only log: the useful
-- question is "why is it still waiting", not the full history of every cycle.
-- A message deferred by quiet hours for eight hours would otherwise accumulate
-- ~96 rows of the same reason.

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS last_deferred_reason text,
  ADD COLUMN IF NOT EXISTS last_deferred_at     timestamptz;

COMMENT ON COLUMN public.scheduled_messages.last_deferred_reason IS
  'Why the most recent cron run declined to send this pending row — quiet hours, a rate cap, a temporary number-lookup failure. Null means nothing has ever deferred it. Not a failure: the row is still pending and will be retried (#128).';

COMMENT ON COLUMN public.scheduled_messages.last_deferred_at IS
  'When last_deferred_reason was recorded. Separate from updated_at, which moves on any write. A stale value here on a still-pending row means the cron itself has stopped running (#128).';

-- Partial: only pending rows are ever read this way, and only deferred ones are
-- interesting. Keeps the index tiny however large the sent history grows.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_deferred
  ON public.scheduled_messages (user_id, last_deferred_at DESC)
  WHERE status = 'pending' AND last_deferred_reason IS NOT NULL;

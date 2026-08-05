-- Two AI replies to the same conversation, in the same second.
--
-- Observed live 2026-08-04: the contact sent "Yes please" at 23:52:33 and
-- "Why not?" at 23:52:36. Both inbound webhooks triggered the Receptionist, both
-- generated, and both sent at 23:52:50 — plus two follow_ups rows, one second
-- apart, for a single request:
--
--   23:52:50  Send a copy of insurance cards and brochure to Tripp Brown...
--   23:52:51  Request for insurance cards and brochure
--
-- People text in bursts. A short thought, then a correction, then a question. It
-- is completely normal and it produced a duplicate reply every time.
--
-- The 10–20 second human-pacing delay makes it worse, not better: it widens the
-- window in which a second message can arrive while the first is still being
-- answered.
--
-- ── Why a column and not a check-before-send ────────────────────────────────
--
-- Reading "has anything been sent since?" and then sending is a race, and these
-- two landed in the SAME SECOND — a read check would have let both through.
-- Claiming the conversation has to be atomic, which means a conditional UPDATE
-- that either matches a row or does not:
--
--   UPDATE threads SET ai_reply_lock_until = now() + interval '45 seconds'
--    WHERE id = $1 AND ai_reply_lock_until < now()
--   RETURNING id
--
-- One caller gets the row and replies. Everyone else gets nothing and stands
-- down. No advisory locks, no extra table, and it works across serverless
-- invocations that share nothing else.
--
-- A timestamp rather than a boolean so it expires on its own: a lambda that dies
-- mid-reply must not silence the conversation for ever. 45 seconds comfortably
-- covers the delay plus generation plus the send.
--
-- ── Why NOT NULL with a sentinel, rather than a nullable column ─────────────
--
-- "Free" is `-infinity`, not NULL, so the claim is one comparison. The obvious
-- nullable version needs `(x IS NULL OR x < now())`, which through supabase-js
-- is `.or('ai_reply_lock_until.is.null,ai_reply_lock_until.lt.<ts>')` — and that
-- fails against PostgREST with:
--
--   column threads.ai_reply_lock_until does not exist
--
-- The column plainly does exist: `.select()`, `.update()`, `.is()` and `.lt()`
-- on it all work; only the or() form breaks, because PostgREST re-parses dotted
-- names inside a logical group. A misleading error for a filter-syntax problem,
-- and it would have failed open at runtime — every claim erroring means every
-- reply either duplicates or stands down, depending on which way the code reads
-- the error.
--
-- `-infinity` sorts before every real timestamp, so an untouched row is always
-- claimable and NULL never enters the picture.

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS ai_reply_lock_until TIMESTAMPTZ;

UPDATE public.threads
   SET ai_reply_lock_until = '-infinity'::timestamptz
 WHERE ai_reply_lock_until IS NULL;

ALTER TABLE public.threads
  ALTER COLUMN ai_reply_lock_until SET DEFAULT '-infinity'::timestamptz;

ALTER TABLE public.threads
  ALTER COLUMN ai_reply_lock_until SET NOT NULL;

COMMENT ON COLUMN public.threads.ai_reply_lock_until IS
  'Held in the future while an AI reply is in flight for this thread; a concurrent inbound stands down rather than replying twice. -infinity means free. Self-expiring so a crashed invocation cannot mute the thread.';

-- The claim filters on this column for one thread, so the primary key already
-- serves it. No index needed.

-- PostgREST caches the schema and will report the new column as non-existent
-- until told otherwise.
NOTIFY pgrst, 'reload schema';

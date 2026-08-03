-- Which of our numbers a conversation runs on (#129).
--
-- `threads.phone_number` is the CONTACT's number, not ours — it matches
-- `messages.to_phone`. Nothing recorded which of the account's numbers a
-- conversation was being held on, so there was no way to keep replying from it.
--
-- That is the second half of the starter-number model: when a business gets its
-- own local number, new conversations move to it, but a lead who was first
-- contacted from the toll-free must keep hearing from the toll-free. Switching
-- numbers mid-conversation breaks threading on the handset and reads as a
-- stranger.
--
-- Backfilled from the most recent outbound message on each thread. That is only
-- reliable because #126 made `from_phone` populated on every send path; before
-- that, the scheduled and bulk paths wrote it as null.
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS sending_number text;

COMMENT ON COLUMN public.threads.sending_number IS
  'Which of the account''s numbers this conversation is held on. Replies stay on it even after the account moves to a local number (#129). Null means no outbound has been sent yet.';

UPDATE public.threads t
   SET sending_number = m.from_phone
  FROM (
    SELECT DISTINCT ON (thread_id) thread_id, from_phone
      FROM public.messages
     WHERE direction = 'outbound' AND from_phone IS NOT NULL AND thread_id IS NOT NULL
     ORDER BY thread_id, created_at DESC
  ) m
 WHERE m.thread_id = t.id
   AND t.sending_number IS NULL;

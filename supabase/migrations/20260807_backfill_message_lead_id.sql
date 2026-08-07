-- Backfill messages.lead_id from the thread (#150). APPLIED 2026-08-07.
--
-- /api/telnyx/send-sms omitted lead_id from its message insert, so receptionist
-- replies were stored with only a thread_id. Inbound messages and drip sends
-- carried it; AI replies did not. Any query shaped `WHERE lead_id = ?` therefore
-- returned the customer's messages with nothing answering them — a conversation
-- that reads as though the AI never replied. I drew exactly that false conclusion
-- from one of these while investigating something else.
--
-- 26 outbound rows were affected; 25 had a thread carrying the lead and are
-- recoverable from it. The thread is the authority: it is set at creation.
--
-- The 3 that remain null afterwards are legitimately null and MUST NOT be
-- "fixed":
--   * one message to a contact whose lead was erased by opt-out (#109) — the
--     suppression outlives the lead by design;
--   * two manual sends into a thread that has no lead at all.
--
-- A client conversation also legitimately has no lead, so null stays valid. The
-- defect is only the DISAGREEMENT — a thread that knows the lead and a message on
-- it that does not. scripts/health.ts asserts exactly that, not "no nulls".

UPDATE messages m
   SET lead_id = t.lead_id
  FROM threads t
 WHERE m.thread_id = t.id
   AND m.lead_id IS NULL
   AND t.lead_id IS NOT NULL;

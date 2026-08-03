-- Support per-contact frequency checks on every send path (#128).
--
-- maxMessagesPerContact and cooldownMinutes moved from a single route into
-- lib/smsGuard, so they now run on all eight send paths instead of one — and
-- they never ran at all before that, because both filtered on `to_number`,
-- which is not a column on this table (the live column is `to_phone`). Verified:
-- `SELECT … WHERE to_number IS NOT NULL` → `column "to_number" does not exist`.
--
-- The old query also used `.ilike('to_number', '%<last10>%')`. A leading
-- wildcard cannot use a btree index under any circumstances, so even with the
-- right column name it would have been a sequential scan per send. `to_phone` is
-- stored E.164, so the guard now matches exact candidates and this index applies.
--
-- Partial on direction: inbound rows are never counted by either check, and
-- excluding them keeps the index proportional to sent volume.
CREATE INDEX IF NOT EXISTS idx_messages_user_tophone_created
  ON public.messages (user_id, to_phone, created_at DESC)
  WHERE direction = 'outbound';

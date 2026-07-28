-- Fix missing `capabilities` on user_telnyx_numbers
--
-- The column was never added via a tracked migration (only number_pool got one,
-- in fix_phone_number_tables.sql), so it's either missing entirely or was added
-- ad hoc without a default. Every insert/upsert path into this table also never
-- set it, so any row written before the app/api fixes has capabilities = NULL.
-- The frontend (app/(dashboard)/phone-numbers/page.tsx) reads
-- number.capabilities.sms/.voice/.mms and crashed on NULL rows.
--
-- All numbers this app provisions are ordered through Telnyx with SMS filtering
-- (see app/api/telnyx/search-numbers/route.ts's filter[features]=sms, and
-- toll-free numbers are gated on getVerifiedTollFreeNumbers() messaging
-- verification), so {voice: true, sms: true, mms: true} is a safe default —
-- consistent with number_pool's own default from create_number_pool.sql.

ALTER TABLE public.user_telnyx_numbers
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": true}'::jsonb;

UPDATE public.user_telnyx_numbers
SET capabilities = '{"voice": true, "sms": true, "mms": true}'::jsonb
WHERE capabilities IS NULL;

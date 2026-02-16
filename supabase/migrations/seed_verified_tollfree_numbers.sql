-- Seed verified toll-free numbers into the number_pool
-- These numbers have been verified via Telnyx toll-free verification
-- Verification ID: 6723e639-83ee-5c48-9ec7-b550fdce868c (status: Verified)
-- Already executed via admin client on 2026-02-05

INSERT INTO number_pool (
  phone_number, phone_sid, friendly_name, number_type,
  is_verified, master_account_sid, is_assigned,
  capabilities
) VALUES
  ('+18887062631', 'telnyx-tf-verified-1', 'Verified Toll-Free #1', 'tollfree', true, 'TELNYX', false, '{"voice": true, "sms": true, "mms": true}'::jsonb),
  ('+18886642550', 'telnyx-tf-verified-2', 'Verified Toll-Free #2', 'tollfree', true, 'TELNYX', false, '{"voice": true, "sms": true, "mms": true}'::jsonb),
  ('+18886638510', 'telnyx-tf-verified-3', 'Verified Toll-Free #3', 'tollfree', true, 'TELNYX', false, '{"voice": true, "sms": true, "mms": true}'::jsonb),
  ('+18884610148', 'telnyx-tf-verified-4', 'Verified Toll-Free #4', 'tollfree', true, 'TELNYX', false, '{"voice": true, "sms": true, "mms": true}'::jsonb),
  ('+18884080726', 'telnyx-tf-verified-5', 'Verified Toll-Free #5', 'tollfree', true, 'TELNYX', false, '{"voice": true, "sms": true, "mms": true}'::jsonb)
ON CONFLICT (phone_number) DO UPDATE SET is_verified = true;

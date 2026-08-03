-- Nothing recorded whether a number was registered to send (audit, 2026-08-03).
--
-- `user_telnyx_numbers` tracked type, primary, lock and rest — every property
-- except the one carriers actually gate on. So resolveFromNumber could not
-- prefer a registered number, and on this account it reliably chose the wrong
-- one:
--
--   +18134972176  local     PRIMARY   assigned to no campaign
--   +18135187997  local               assigned to CAAP953 (MNO_PROVISIONED)
--   +18887062631  tollfree            TFV Verified
--
-- The resolver prefers local numbers for new conversations (#129) and then
-- takes the primary — landing on the single unregistered number while two
-- properly registered ones sat unused. Unregistered A2P long-code traffic is
-- filtered by carriers and damages the number's reputation, so this is not a
-- slightly-worse choice, it is the one choice that cannot work.
--
-- ── Raw facts, not a derived boolean ────────────────────────────────────────
--
-- Storing `is_registered` would flatten two different registration systems that
-- fail differently and are fixed differently: a long code is assigned to a
-- 10DLC campaign, a toll-free number passes a Verification Request. Keeping
-- both lets the UI say which one is missing, and lets `isRegistered()` decide
-- per number type in one place (lib/numberRegistration.ts).
--
-- ── These are a cache of Telnyx, and Telnyx is the source of truth ──────────
--
-- Assignment can change outside this app: support can move a number, a campaign
-- can be deleted, a TFV can be revoked. `registration_synced_at` records how
-- stale the answer is so a reader can tell "unregistered" from "never checked".
-- Null in every column means never checked, which `isRegistered` treats as NOT
-- registered — the safe direction.

ALTER TABLE public.user_telnyx_numbers
  ADD COLUMN IF NOT EXISTS messaging_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS tollfree_verification_status TEXT,
  ADD COLUMN IF NOT EXISTS registration_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_telnyx_numbers.messaging_campaign_id IS
  'Telnyx 10DLC campaign this long code is assigned to. NULL = not assigned, so not registered to send A2P.';
COMMENT ON COLUMN public.user_telnyx_numbers.tollfree_verification_status IS
  'Toll-free Verification status from Telnyx: verified | rejected | pending. NULL = never submitted.';
COMMENT ON COLUMN public.user_telnyx_numbers.registration_synced_at IS
  'When the two columns above were last reconciled against Telnyx. NULL = never checked, treated as unregistered.';

-- resolveFromNumber reads every active number for a user on every send and now
-- partitions them by registration. Narrow index on the hot filter.
CREATE INDEX IF NOT EXISTS idx_user_telnyx_numbers_active_by_user
  ON public.user_telnyx_numbers (user_id)
  WHERE status = 'active';

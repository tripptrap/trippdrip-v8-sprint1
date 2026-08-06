-- Notice a 10DLC campaign going quiet before the carriers do. (#136)
--
-- Telnyx support, 2026-08-04:
--
--   "If a campaign is inactive for I believe 45 days we place it in dormant
--    status. There is a wireless carrier fine/penalty if a campaign is verified
--    and inactive on their networks. So we place the campaign into dormant
--    status to avoid $500 plus fees."
--
-- In the per-agent model every customer carries their own campaign, so ordinary
-- churn leaves verified campaigns idle. The dormancy mechanism that absorbs the
-- penalty belongs to Telnyx; we neither monitor nor control it, and at 100-1000
-- agents some number go quiet every month with nobody watching.
--
-- ── What is stored, and what is not ────────────────────────────────────────
--
-- NOT last_traffic_at. Idleness is derived from `messages` on each run, because a
-- denormalised copy drifts the moment anything writes a message without updating
-- it — and this whole issue exists because nothing was aggregating that data in
-- the first place. Deriving costs one grouped query per run and cannot go stale.
--
-- What IS stored is the state machine that a derived value cannot hold: whether
-- the customer has already been warned (so a daily job does not nag daily), and
-- whether a campaign has crossed into needing deactivation.

ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS idle_warned_at TIMESTAMPTZ;

ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS idle_warned_at_days INTEGER;

ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS deactivation_required_at TIMESTAMPTZ;

ALTER TABLE public.user_10dlc_registrations
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

COMMENT ON COLUMN public.user_10dlc_registrations.idle_warned_at IS
  'When the customer was last told their campaign is going quiet. Cleared when traffic resumes, so a returning customer can be warned again later.';

COMMENT ON COLUMN public.user_10dlc_registrations.idle_warned_at_days IS
  'The idle-day threshold that warning was sent for. Lets the job escalate (30 -> 40) without re-sending the same warning every night.';

COMMENT ON COLUMN public.user_10dlc_registrations.deactivation_required_at IS
  'Set when a campaign should be deactivated — idle past the safe window, or the account churned. NOTE: nothing deactivates automatically. The correct Telnyx call is not known (see deactivation_reason and #136); PUT /10dlc/campaign/{id} with campaignStatus DEACTIVATED returns 200 but moves TCR_FAILED -> TCR_PENDING, which is an edit-and-resubmit. This column is a work queue for a human.';

COMMENT ON COLUMN public.user_10dlc_registrations.deactivation_reason IS
  'Why deactivation was flagged: idle_45d, subscription_lapsed, account_suspended.';

-- The nightly job scans every non-mock registration that still has a campaign,
-- which is a small set, but the partial index keeps it cheap as agents scale and
-- makes "what is waiting on a human" a single lookup.
CREATE INDEX IF NOT EXISTS user_10dlc_registrations_deactivation_idx
  ON public.user_10dlc_registrations (deactivation_required_at)
  WHERE deactivation_required_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';

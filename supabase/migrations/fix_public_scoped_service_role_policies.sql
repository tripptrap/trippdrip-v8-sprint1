-- Remove RLS policies that grant access to everyone (#65).
--
-- A set of policies are named "Service role can …" / "System can …" but are
-- scoped to {public}, which includes anon and authenticated. service_role
-- BYPASSES RLS entirely, so these never granted it anything — they only ever
-- granted access to everyone else.
--
-- Confirmed by inserting rows into payments, notifications and dnc_history
-- using the public anon key (then deleting them). user_telnyx_numbers was
-- readable by anonymous callers, exposing every number and its owner.
--
-- Each policy below is either dropped outright (nothing legitimate depended on
-- it) or replaced with an owner-scoped equivalent where a request-scoped
-- client genuinely needs access. Which one was decided by checking every
-- writer/reader of each table and whether it uses the service-role client.

-- ── Drop outright: only service-role code touches these ─────────────────────

-- users: "Users can update own profile" (auth.uid() = id) already covers every
-- legitimate request-scoped write. This policy additionally allowed UPDATE with
-- USING true AND WITH CHECK true. Not exploitable today only because the
-- restrictive SELECT policy limits which rows an UPDATE can find — add a
-- permissive SELECT here later and it opens silently.
DROP POLICY IF EXISTS "Service role can update all users" ON public.users;

-- payments: written only by stripe/webhook (service-role).
DROP POLICY IF EXISTS "System can insert payments" ON public.payments;

-- notifications: inserted only by lib/createNotification.ts (service-role).
-- The request-scoped route only reads and marks-as-read, both already covered.
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- referrals / referral_rewards: no code writes these tables at all — the only
-- route touching them (referrals/stats) does read-only selects.
DROP POLICY IF EXISTS "System can create referrals" ON public.referrals;
DROP POLICY IF EXISTS "System can update referrals" ON public.referrals;
DROP POLICY IF EXISTS "System can create rewards" ON public.referral_rewards;

-- service_emails: no updater exists; email/service only inserts.
DROP POLICY IF EXISTS "System can update service emails" ON public.service_emails;

-- ── Replace: a request-scoped client legitimately needs these ───────────────

-- dnc_history: lib/smsGuard.ts writes the blocked-send audit row, and is called
-- with a request-scoped client from campaigns/run and messages/schedule/bulk
-- (the crons pass service-role). Scope the insert to the caller's own rows.
DROP POLICY IF EXISTS "System can insert DNC history" ON public.dnc_history;
CREATE POLICY "Users can insert their own DNC history"
  ON public.dnc_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- service_emails: app/api/email/service inserts with user_id = user.id using a
-- request-scoped client.
DROP POLICY IF EXISTS "System can insert service emails" ON public.service_emails;
CREATE POLICY "Users can insert their own service emails"
  ON public.service_emails
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- user_telnyx_numbers: six request-scoped routes read this (10dlc/status,
-- texts/threads/draft, ai-drip/start, follow-ups/send-calendar-link,
-- notifications/sms-alert, number-pool/purchase-with-credits). They only ever
-- need the caller's own numbers — the previous policy exposed everyone's.
DROP POLICY IF EXISTS "Service role can view all numbers" ON public.user_telnyx_numbers;
CREATE POLICY "Users can view their own numbers"
  ON public.user_telnyx_numbers
  FOR SELECT
  USING (auth.uid() = user_id);

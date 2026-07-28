-- Enable RLS on the two public tables that were missing it (#56).
--
-- Found 2026-07-28 by connecting with the project's public anon key (the one
-- shipped to every browser) and successfully reading both tables. 57 of 59
-- public tables had RLS enabled; these two did not.
--
-- contact_form_submissions is the serious one: it holds lead PII (name, email,
-- phone) and the TCPA consent record (consent_text, consent_ip,
-- consent_user_agent, consent_at). Anonymous reads exposed every tenant's
-- leads, and anonymous writes were not blocked either — an insert attempt
-- failed only on a NOT NULL constraint (23502), not on permissions, meaning
-- consent records could have been forged.
--
-- number_pool already HAD a policy defined in create_number_pool.sql, but RLS
-- was never enabled on the table, so the policy was inert. A policy without
-- ENABLE ROW LEVEL SECURITY provides no protection while looking like it does.
--
-- Note: the service_role key bypasses RLS entirely, so every server route using
-- createServiceRoleClient() is unaffected. Two routes that used the
-- request-scoped client were switched to service-role in the same change:
--   - app/api/contact-form/route.ts   (public form, no session to key off)
--   - app/api/telnyx/release-number/route.ts (returns a number to the pool)

-- ── contact_form_submissions ────────────────────────────────────────────────
ALTER TABLE public.contact_form_submissions ENABLE ROW LEVEL SECURITY;

-- Owners can read their own captured submissions. No INSERT/UPDATE/DELETE
-- policy is defined on purpose: all writes go through trusted server routes
-- (/api/contact-form, /api/opt-in/submit) which use the service-role key and
-- validate input. With RLS on and no write policy, anonymous writes are denied,
-- which is what closes the consent-forgery hole.
DROP POLICY IF EXISTS "Users can view their own contact form submissions"
  ON public.contact_form_submissions;
CREATE POLICY "Users can view their own contact form submissions"
  ON public.contact_form_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── number_pool ─────────────────────────────────────────────────────────────
ALTER TABLE public.number_pool ENABLE ROW LEVEL SECURITY;

-- Signed-in users may browse numbers that are actually claimable, so the
-- onboarding picker works. Deliberately narrower than the original inert
-- policy: it also required is_verified, but that flag is reconciled against
-- Telnyx now (#36) and the availability route filters on it server-side, so
-- keeping it here too would double-gate on a value the client shouldn't rely
-- on. Anonymous callers get nothing.
DROP POLICY IF EXISTS "Anyone can view available numbers" ON public.number_pool;
DROP POLICY IF EXISTS "Authenticated users can view unassigned pool numbers"
  ON public.number_pool;
CREATE POLICY "Authenticated users can view unassigned pool numbers"
  ON public.number_pool
  FOR SELECT
  TO authenticated
  USING (is_assigned = false);

-- Users can see the pool row for a number currently assigned to them.
DROP POLICY IF EXISTS "Users can view their own assigned pool number"
  ON public.number_pool;
CREATE POLICY "Users can view their own assigned pool number"
  ON public.number_pool
  FOR SELECT
  TO authenticated
  USING (auth.uid() = assigned_to_user_id);

-- No write policies: claiming and releasing run server-side with the
-- service-role key, so a client can never assign a number to itself.

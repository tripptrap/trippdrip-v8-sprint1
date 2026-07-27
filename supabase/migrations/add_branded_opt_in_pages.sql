-- Per-user branded opt-in pages (GitHub issue #21).
--
-- Required for per-agent 10DLC registration: Telnyx demands a publicly
-- accessible opt-in form URL whose consent checkbox NAMES THE SPECIFIC BRAND.
-- The old shared /opt-in page said "my sales representative" and named nobody,
-- which cannot serve as consent evidence for an individual business.
-- See docs/10DLC_REJECTION_HISTORY.md.

-- Public, URL-safe identifier for each business's own opt-in page:
--   https://hyvewyre.com/opt-in/<opt_in_slug>
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS opt_in_slug TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_opt_in_slug
  ON public.users(opt_in_slug)
  WHERE opt_in_slug IS NOT NULL;

-- Attribute each submission to the business that collected it, and keep a
-- durable audit trail of WHAT the consumer actually agreed to. Carriers can
-- request consent proof long after the fact, and the disclaimer wording may
-- change over time — so store the exact text shown at the moment of consent.
ALTER TABLE public.contact_form_submissions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.contact_form_submissions
  ADD COLUMN IF NOT EXISTS consent_text TEXT;
ALTER TABLE public.contact_form_submissions
  ADD COLUMN IF NOT EXISTS consent_ip TEXT;
ALTER TABLE public.contact_form_submissions
  ADD COLUMN IF NOT EXISTS consent_user_agent TEXT;
ALTER TABLE public.contact_form_submissions
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contact_form_user_id
  ON public.contact_form_submissions(user_id);

-- The old unique-by-phone assumption breaks once submissions are per-business:
-- the same consumer may legitimately opt in to two different businesses.
--
-- Deliberately NOT a partial index: Postgres cannot use a partial index for
-- ON CONFLICT inference, which the opt-in upsert relies on. Legacy rows with a
-- NULL user_id are unaffected either way, since NULLs never collide in a
-- unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_form_user_phone
  ON public.contact_form_submissions(user_id, phone);

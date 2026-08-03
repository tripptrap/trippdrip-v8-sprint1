-- Where a lead's consent actually came from (#130).
--
-- ── The problem ─────────────────────────────────────────────────────────────
--
-- `leads.sms_opt_in` had `DEFAULT true`. Every lead created by any route — CSV
-- import, manual entry, the browser extension, the inbound webhook — was marked
-- as having consented, with nothing behind it. Measured before this migration:
--
--     leads                                209
--     contact_form_submissions (consent)     0
--     leads with sms_opt_in = false          0
--
-- So the flag was true for every lead in the system and had never been false. A
-- column that is always true carries no information, and `smsGuard` checking it
-- enforced nothing. The public compliance page claimed otherwise until #131.
--
-- ── What changes ────────────────────────────────────────────────────────────
--
-- The default is dropped, so a lead's consent status is **unknown** unless
-- something establishes it, and `consent_source` records *what* established it.
-- The two are deliberately separate: `sms_opt_in` is the answer, and
-- `consent_source` is the evidence for it. An audit needs both.
--
--   opt_in_form      the consumer completed the branded opt-in page. Real
--                    evidence exists in contact_form_submissions — the verbatim
--                    disclosure text, IP, user agent and timestamp.
--   agent_attested   the business asserted, at import or manual entry, that it
--                    holds prior express written consent. The assertion and who
--                    made it are recorded; the underlying proof is theirs.
--   inbound_message  the person messaged the business first.
--   legacy_unknown   predates this migration. No evidence either way.
--
-- ── Why existing rows are marked rather than reset ──────────────────────────
--
-- All 209 belong to one account and none has evidence behind it. Setting
-- `sms_opt_in` to null for them would be the strictest reading, but it silently
-- changes the messaging status of data somebody may be relying on. Marking them
-- `legacy_unknown` leaves behaviour untouched, makes them findable in one query,
-- and leaves the decision where it belongs.
--
--     SELECT count(*) FROM public.leads WHERE consent_source = 'legacy_unknown';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_source      text,
  ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

COMMENT ON COLUMN public.leads.consent_source IS
  'What established this lead''s consent: opt_in_form | agent_attested | inbound_message | legacy_unknown. Null means nothing has (#130).';

COMMENT ON COLUMN public.leads.consent_recorded_at IS
  'When consent_source was set. For agent_attested this is when the business made the assertion, not when the consumer consented (#130).';

-- Existing rows: honest label, no behaviour change.
UPDATE public.leads
   SET consent_source = 'legacy_unknown'
 WHERE consent_source IS NULL;

-- The lie. From here, a lead's consent is unknown until a route says otherwise.
ALTER TABLE public.leads
  ALTER COLUMN sms_opt_in DROP DEFAULT;

COMMENT ON COLUMN public.leads.sms_opt_in IS
  'True when consent is established, false when the person opted out, NULL when unknown. Had DEFAULT true until #130, which made it meaningless — it was true for all 209 leads and had never been false.';

-- Finding leads without a basis for contacting them is the whole point, so it
-- should be one indexed query rather than a scan.
CREATE INDEX IF NOT EXISTS idx_leads_consent_source
  ON public.leads (user_id, consent_source);

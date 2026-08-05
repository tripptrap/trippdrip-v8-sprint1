-- Two independent time windows govern messaging, and nothing said which was which. (#140)
--
-- Observed 2026-08-04 on the account under test:
--
--   users.quiet_hours_*                enabled, 08:00-20:00 America/New_York
--   receptionist_settings.business_*   enabled, 08:00-20:00 America/New_York, days {1..7}
--
-- Identical windows. They fail at the same instant, so an observed "no reply"
-- could not be attributed to either one without reading the database — and they
-- do completely different jobs.
--
-- Worth noting what is NOT wrong here: the column defaults are sensible and
-- different (quiet 08:00-20:00, business 09:00-17:00). The collision is one
-- account's own configuration, not a system-wide default. The quiet-hours values
-- being identical across all four tripp* accounts is simply the default showing
-- through — nobody has ever edited them, and there is no UI copy explaining what
-- editing them would do.
--
-- These comments are the durable half of the fix; the UI carries the rest.

COMMENT ON COLUMN public.users.quiet_hours_enabled IS
  'Whether the quiet-hours window is enforced for this account.';

COMMENT ON COLUMN public.users.quiet_hours_start IS
  'Start of the window during which UNSOLICITED automated outbound may send — campaigns, drips, scheduled messages. NOT a silence window: this is the ALLOWED span. Does not apply to replies to an inbound message (lib/smsGuard.ts, GuardOptions.isReply), because someone who texts you at 11pm has invited an answer. Distinct from receptionist_settings.business_hours_* — see #140.';

COMMENT ON COLUMN public.users.quiet_hours_end IS
  'End of the allowed sending window for unsolicited automated outbound. See quiet_hours_start.';

COMMENT ON COLUMN public.receptionist_settings.business_hours_enabled IS
  'Whether business hours are enforced. When false the receptionist always answers normally and never sends the after-hours message.';

COMMENT ON COLUMN public.receptionist_settings.business_hours_start IS
  'Start of the window in which the receptionist gives a REAL AI answer. Outside it the contact still gets a reply — the canned after_hours_message — it is not silence. Governs reply CONTENT, not whether sending is permitted; that is users.quiet_hours_* (#140).';

COMMENT ON COLUMN public.receptionist_settings.business_hours_end IS
  'End of the real-answer window. See business_hours_start.';

COMMENT ON COLUMN public.receptionist_settings.after_hours_message IS
  'Sent once per closed period, not once per inbound (#138). Suppression is keyed on receptionist_logs rows with response_type = ''after_hours'' since closedPeriodStart().';

-- ── business_days encoding, pinned ──────────────────────────────────────────
--
-- An untyped integer[] with no constraint and no comment. Whether it meant ISO
-- (1=Mon..7=Sun) or Postgres DOW (0=Sun..6=Sat) was not determinable from the
-- database at all, and the two disagree about every value: {1,2,3,4,5} happens
-- to be Mon-Fri under both, which is exactly the kind of coincidence that hides
-- the ambiguity until someone stores a 0 or a 6 and the week silently shifts.
--
-- The code is ISO — lib/receptionist/businessHours.ts maps Mon->1 .. Sun->7, and
-- the day picker in components/ReceptionistSettings.tsx emits the same. A 0
-- would never match any day and would silently make that day closed forever.
--
-- The CHECK makes the encoding a property of the data rather than a convention,
-- and rejects the 0 that a DOW-shaped writer would produce.

ALTER TABLE public.receptionist_settings
  DROP CONSTRAINT IF EXISTS receptionist_settings_business_days_iso;

ALTER TABLE public.receptionist_settings
  ADD CONSTRAINT receptionist_settings_business_days_iso
  CHECK (
    business_days IS NULL
    -- Every element is an ISO weekday. `<@` is "contained by", so this rejects a
    -- 0 (Postgres DOW Sunday) and anything above 7.
    --
    -- Duplicates are deliberately not checked: expressing "no repeats" needs a
    -- subquery, and CHECK constraints cannot contain one ("cannot use subquery
    -- in check constraint", 0A000). They are harmless in any case — the reads
    -- are all `includes()`. The bound below keeps the array from growing without
    -- limit.
    OR (business_days <@ ARRAY[1,2,3,4,5,6,7] AND array_length(business_days, 1) <= 7)
  );

COMMENT ON COLUMN public.receptionist_settings.business_days IS
  'ISO weekdays the business is open: 1=Monday .. 7=Sunday. NOT Postgres DOW (0=Sunday) — a 0 matches no day and would make that day permanently closed. Enforced by receptionist_settings_business_days_iso.';

NOTIFY pgrst, 'reload schema';

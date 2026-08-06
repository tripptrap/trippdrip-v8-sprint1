-- What can the receptionist actually offer to DO with information?
--
-- Observed live 2026-08-06. A client texted:
--
--   "I need info about my brochure and insurance cards, can you email..."
--
-- and got back an offer of a callback. That is the AI's only move today: when
-- someone asks for a document it says a person will follow up, because nothing
-- tells it whether this business can send a brochure by email, text it, or
-- genuinely can only talk on the phone.
--
-- A callback is the right answer for an agency that has to read something out.
-- It is the wrong answer for one that could have emailed the PDF, and it is the
-- difference between "handled" and "chased" from the customer's side.
--
-- So the operator declares what is possible, and the AI offers that instead of
-- defaulting to a call every time.
--
-- ── Why three flags rather than one enum ───────────────────────────────────
--
-- The real answers are combinations: plenty of agencies email documents AND take
-- calls; some will text a link but never email a policy. An enum would force
-- them to pick one and get the other wrong. Booleans also degrade correctly — all
-- false is "call only", which is exactly today's behaviour, so nothing changes
-- for anyone who never opens the setting.

ALTER TABLE public.receptionist_settings
  ADD COLUMN IF NOT EXISTS can_send_info_by_email BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.receptionist_settings
  ADD COLUMN IF NOT EXISTS can_send_info_by_sms BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.receptionist_settings
  ADD COLUMN IF NOT EXISTS info_delivery_note TEXT;

COMMENT ON COLUMN public.receptionist_settings.can_send_info_by_email IS
  'The receptionist may offer to EMAIL documents, brochures and copies. Default false, which keeps the existing behaviour: offer a callback. It offers to collect an address, never claims to have sent anything — a person still does that from the dashboard todo.';

COMMENT ON COLUMN public.receptionist_settings.can_send_info_by_sms IS
  'The receptionist may offer to TEXT information or a link. Same rule as email: it offers, a person delivers.';

COMMENT ON COLUMN public.receptionist_settings.info_delivery_note IS
  'Optional free text naming what this business can and cannot send, e.g. "brochures and quotes by email; never policy documents or ID cards". Injected into the prompt so the AI does not promise something the operator cannot deliver.';

NOTIFY pgrst, 'reload schema';

-- Type-correct three internal id columns and constrain messages.direction
-- (#68, #66).
--
-- messages.thread_id, lead_flows.thread_id and leads.current_flow_id are TEXT
-- while the keys they reference (threads.id, conversation_flows.id) are UUID.
-- Postgres won't create a foreign key across mismatched types, so nothing
-- enforced that the referenced row exists — and joins needed an explicit
-- ::text cast, silently returning nothing when omitted.
--
-- Safe to convert: all 64 existing messages have a well-formed UUID thread_id
-- and 0 are orphaned; lead_flows is empty; no lead has current_flow_id set.
-- Checked immediately before writing this.

-- ── messages.thread_id -> uuid, with a real FK ──────────────────────────────
ALTER TABLE public.messages
  ALTER COLUMN thread_id TYPE uuid USING NULLIF(thread_id, '')::uuid;

-- ON DELETE SET NULL, not CASCADE: deleting a thread must not destroy the
-- message history of what was actually sent to a lead.
ALTER TABLE public.messages
  ADD CONSTRAINT messages_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.messages(thread_id);

-- ── lead_flows.thread_id -> uuid ────────────────────────────────────────────
ALTER TABLE public.lead_flows
  ALTER COLUMN thread_id TYPE uuid USING NULLIF(thread_id, '')::uuid;

ALTER TABLE public.lead_flows
  ADD CONSTRAINT lead_flows_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE SET NULL;

-- ── leads.current_flow_id: drop it ──────────────────────────────────────────
-- No code reads or writes this column anywhere, and no row has a value. It
-- competed with leads.flow_id (uuid, already has an FK), which is the one the
-- webhook and flow assignment actually use. Two columns claiming to hold "the
-- lead's current flow" is exactly the ambiguity that produces "the AI is asking
-- the wrong questions" bugs.
ALTER TABLE public.leads DROP COLUMN IF EXISTS current_flow_id;

-- ── messages.direction: constrain to one vocabulary (#66) ───────────────────
-- The old CHECK permitted 'in', 'out', 'inbound' and 'outbound', so
-- .eq('direction','outbound') silently missed rows written as 'out'. Nothing
-- ever wrote 'in', which is why any query filtering on it returned zero rows
-- forever.
--
-- All 64 existing rows already use inbound/outbound, so no backfill is needed —
-- but normalise defensively in case anything landed between the check and this
-- migration running.
UPDATE public.messages SET direction = 'outbound' WHERE direction = 'out';
UPDATE public.messages SET direction = 'inbound'  WHERE direction = 'in';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_direction_check
  CHECK (direction IN ('inbound', 'outbound'));

COMMENT ON COLUMN public.messages.direction IS
  'inbound or outbound only. Previously also accepted in/out, which split queries across two vocabularies — see #66.';

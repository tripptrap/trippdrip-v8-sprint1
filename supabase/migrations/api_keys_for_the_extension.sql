-- Durable, revocable API keys for the browser extension. (#148)
--
-- The extension authenticates with `Authorization: Bearer <token>` (#147). Until
-- now the only thing that satisfied that was a Supabase **access token**, which
-- expires in about an hour while chrome.storage.sync keeps the pasted value for
-- ever. So the extension worked for an hour after each paste and then quietly
-- reverted to canned fallback text — `popup.js` shows its own template output on
-- any non-2xx, so the user could not tell the difference.
--
-- ── Only a hash is stored ───────────────────────────────────────────────────
--
-- The key is shown once, at creation, and never again. What lives here is
-- sha256(key), so a copy of this table cannot be used to call the API.
--
-- SHA-256 rather than bcrypt/argon deliberately. Those exist to make *guessing*
-- expensive for low-entropy human passwords. An API key here is 32 bytes from a
-- CSPRNG — 256 bits — so guessing is not the threat model, and a slow hash on
-- every request would just be a per-call tax. This is what the equivalent tables
-- at Stripe and GitHub do.
--
-- `key_prefix` is the first few characters, stored in the clear purely so the UI
-- can show "hyve_live_A1b2…" and the user can tell two keys apart. It is far too
-- short to narrow a search of a 256-bit space.
--
-- ── Lookup is by hash, which is why the index is unique ────────────────────
--
-- Verification hashes the presented key and selects that row. One indexed
-- equality lookup, no scan over candidate rows, and no timing signal that
-- depends on how many keys exist.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- sha256 of the key, lowercase hex. Never the key itself.
  key_hash     TEXT NOT NULL,
  -- Display only, e.g. 'hyve_live_A1b2c3d4'. Not a credential.
  key_prefix   TEXT NOT NULL,

  -- What the user called it, so several keys are distinguishable.
  name         TEXT NOT NULL DEFAULT 'Browser extension',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Updated on use. Best-effort: a failed write here must never fail the request
  -- it is describing.
  last_used_at TIMESTAMPTZ,
  -- Set to revoke. Kept rather than deleted so the audit trail survives, and so
  -- "this key was revoked on the 4th" is answerable.
  revoked_at   TIMESTAMPTZ,

  CONSTRAINT api_keys_key_hash_is_sha256 CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_key ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON public.api_keys (user_id);

-- ── Grants: the same posture as the points ledger (#144) ───────────────────
--
-- No client-side access at all. Listing, creating and revoking go through API
-- routes that verify the session and then act as service_role, so `authenticated`
-- never needs to touch this table — and cannot read key_hash, which is the only
-- column worth protecting. TRUNCATE is included in the revoke because it ignores
-- RLS: without it, a role with table access could drop every key on the platform
-- in one statement.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_keys FROM PUBLIC;
REVOKE ALL ON public.api_keys FROM anon, authenticated;
GRANT ALL ON public.api_keys TO service_role;

COMMENT ON TABLE public.api_keys IS
  'Durable API keys for non-browser clients, the extension above all (#148). Stores sha256(key) only — the key itself is shown once at creation and is unrecoverable. No client-side grants: mint, list and revoke through /api/settings/api-keys, which verifies the session and acts as service_role.';

COMMENT ON COLUMN public.api_keys.key_hash IS
  'Lowercase hex sha256 of the key. Verification hashes the presented key and looks it up here, so this column is the only thing that ever needs to match.';

COMMENT ON COLUMN public.api_keys.revoked_at IS
  'Non-null means the key is dead. Rows are kept rather than deleted so revocation is auditable; authenticateRequest filters on this being NULL.';

NOTIFY pgrst, 'reload schema';

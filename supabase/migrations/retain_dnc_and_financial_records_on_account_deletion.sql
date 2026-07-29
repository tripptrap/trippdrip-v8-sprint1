-- Stop account deletion from destroying opt-outs and financial records (#93).
--
-- dnc_list, dnc_history, payments and transactions all had ON DELETE CASCADE to
-- auth.users, so deleting an account destroyed every opt-out that user had ever
-- recorded plus the audit trail proving it. app/api/user/delete-account
-- deliberately excluded those tables from its purge (#87), but that was
-- ineffective — the database removed them anyway.
--
-- Confirmed by seeding a dnc_list row, deleting the account, and watching the
-- table go back to zero.
--
-- NOTE: information_schema.constraint_column_usage does NOT reliably report
-- cross-schema foreign keys and showed none of these. pg_constraint is
-- authoritative. Check there before assuming a table is safe.

-- ── 1. Rows must survive the owner ──────────────────────────────────────────
-- payments/transactions are NOT NULL on user_id, so SET NULL needs that relaxed
-- first. A NULL owner is exactly the post-deletion state we want to represent.
ALTER TABLE public.payments      ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transactions  ALTER COLUMN user_id DROP NOT NULL;

-- ── 2. Preserve provenance ─────────────────────────────────────────────────
-- Without this, a retained row loses the one thing that made it a record: whose
-- it was. Populated by delete-account immediately before the auth record goes.
ALTER TABLE public.dnc_list      ADD COLUMN IF NOT EXISTS deleted_user_id uuid;
ALTER TABLE public.dnc_history   ADD COLUMN IF NOT EXISTS deleted_user_id uuid;
ALTER TABLE public.payments      ADD COLUMN IF NOT EXISTS deleted_user_id uuid;
ALTER TABLE public.transactions  ADD COLUMN IF NOT EXISTS deleted_user_id uuid;

COMMENT ON COLUMN public.dnc_list.deleted_user_id IS
  'Owner at the time their account was deleted. user_id is nulled by the FK; this keeps the record attributable. See #93.';

-- ── 3. CASCADE -> SET NULL ─────────────────────────────────────────────────
ALTER TABLE public.dnc_list DROP CONSTRAINT IF EXISTS dnc_list_user_id_fkey;
ALTER TABLE public.dnc_list
  ADD CONSTRAINT dnc_list_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.dnc_history DROP CONSTRAINT IF EXISTS dnc_history_user_id_fkey;
ALTER TABLE public.dnc_history
  ADD CONSTRAINT dnc_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 4. Keep opt-outs ENFORCED, not merely retained ─────────────────────────
--
-- Retention alone doesn't protect anyone. check_dnc() matches
-- `dnc_list WHERE user_id = p_user_id` or the global list, so a row whose owner
-- has been nulled matches neither — the record survives while enforcement
-- silently stops. That would be worse than the original bug, because the row
-- looks like protection.
--
-- So a deleted account's opt-outs are PROMOTED to dnc_global. Rationale: this
-- platform shares a number pool (#38), numbers are reassigned to other tenants,
-- and a consumer who texted STOP to a pool number opted out of *that number*,
-- which will be reused. Over-blocking is the safe direction here.
--
-- Trade-off, stated plainly: a deleted tenant's opt-outs then suppress those
-- numbers for every tenant. With a shared pool that is the point. If the number
-- model ever becomes strictly per-tenant, revisit — the promotion happens in
-- one place (this function) and can simply be dropped.
--
-- Also gives dnc_global its first writer: check_dnc() has always read it and
-- nothing has ever written to it (#88).

CREATE OR REPLACE FUNCTION public.promote_user_dnc_to_global(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_promoted integer;
BEGIN
  WITH promoted AS (
    INSERT INTO public.dnc_global (phone_number, normalized_phone, reason, source, notes)
    SELECT d.phone_number,
           d.normalized_phone,
           COALESCE(d.reason, 'opted out'),
           'account_deleted',
           'Promoted from a deleted account''s DNC list (#93). Original owner: '
             || promote_user_dnc_to_global.p_user_id
    FROM public.dnc_list d
    WHERE d.user_id = promote_user_dnc_to_global.p_user_id
      AND d.normalized_phone IS NOT NULL
    -- dnc_global is unique on both phone columns; an entry already there is
    -- already blocking, so leave it as-is rather than failing the deletion.
    ON CONFLICT (normalized_phone) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_promoted FROM promoted;

  RETURN v_promoted;
END;
$$;

COMMENT ON FUNCTION public.promote_user_dnc_to_global(uuid) IS
  'Moves a deleting account''s opt-outs into the platform-wide DNC list so they keep being enforced after user_id is nulled. Called by delete-account before the auth record is removed. See #93.';

REVOKE ALL ON FUNCTION public.promote_user_dnc_to_global(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_user_dnc_to_global(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.promote_user_dnc_to_global(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_dnc_to_global(uuid) TO service_role;

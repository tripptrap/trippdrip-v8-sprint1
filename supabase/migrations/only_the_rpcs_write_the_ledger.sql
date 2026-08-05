-- Take the pen away from the browser. (#144)
--
-- `authenticated` held INSERT, UPDATE and DELETE on public.points_transactions.
-- RLS scoped them to the user's own rows, but inside that scope a logged-in user
-- could forge ledger entries or delete real ones straight from the console.
--
-- That was survivable while the ledger was decorative. It is not now: as of #137
-- points_transactions is the authoritative record of every balance change, and
-- every points figure in the app reads it. users.credits was already locked down
-- by column grants — `authenticated` may write only business_hours,
-- business_name, timezone and updated_at — so leaving the audit trail writable
-- meant the balance was protected and its history was not, which is the worse
-- half to lose. A forged +50,000 'purchase' row cannot move the balance, but it
-- can make the ledger reconcile to a balance that was never paid for.
--
-- ── Nothing legitimate writes this table from a session ─────────────────────
--
-- Checked every `from('points_transactions')` in app/, lib/ and components/
-- before revoking:
--
--   stripe/webhook:245, :390, :512   INSERT on supabaseAdmin (service role)
--   lib/pointsSupabase.ts:101, :164  INSERT on the BROWSER client — both sit
--                                    after a users.credits UPDATE that the
--                                    column grants already refuse, so the
--                                    function returns before reaching them.
--                                    Dead either way; tracked in #143.
--   everything else                  SELECT
--
-- No DELETE anywhere. Account deletion (user/delete-account) purges through
-- `adminClient`, and points_transactions cascades off users.id regardless
-- (ON DELETE CASCADE), so this does not touch that path.
--
-- The caller-side inserts that used to need this grant were removed in 0f7f5d4:
-- deduct_credits and add_credits write their own rows now, both SECURITY DEFINER
-- and both executable by service_role only. They are the only writers left.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.points_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.points_transactions FROM anon;

-- TRUNCATE as well, and it is the one that matters most on a ledger: it ignores
-- RLS completely, so where DELETE could only have removed the caller's own rows,
-- TRUNCATE would empty the table for every account at once.
--
-- Not currently reachable — PostgREST exposes no TRUNCATE verb, and the only
-- public function whose name suggested dynamic SQL (execute_auto_tagging_rule)
-- turns out to be static: its "EXECUTE" is a comment and a CASE statement, not
-- EXECUTE format(). So this is depth, not a hole that was open.
--
-- It is granted on 59 of the 62 public tables, because `GRANT ALL ON ALL TABLES
-- TO anon, authenticated` is the Supabase default and RLS is assumed to be the
-- fence. TRUNCATE is precisely the privilege RLS does not fence. Fixed here for
-- the ledger; the other 58 are filed separately rather than swept in blind.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.points_transactions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.points_transactions FROM anon;

-- Reading your own history stays. That is what /points and /credit-history do,
-- through the "Users can view own transactions" policy.
GRANT SELECT ON public.points_transactions TO authenticated;

-- This policy is now unreachable — a policy cannot grant what the table grant
-- withholds — and leaving it in place would advertise an ability that no longer
-- exists, which is exactly how someone re-adds the grant "to make the policy
-- work". If a session-side insert is ever genuinely needed, restore both
-- together and say why.
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.points_transactions;

COMMENT ON TABLE public.points_transactions IS
  'Authoritative ledger of every credits change (#137). Written ONLY by deduct_credits and add_credits, which are SECURITY DEFINER and service_role-only; the Stripe webhook also inserts directly on the service-role client, where its row doubles as the stripe_session_id idempotency claim. authenticated has SELECT and nothing else (#144) — do not re-grant writes without removing the reason the RPCs own them.';

COMMIT;

NOTIFY pgrst, 'reload schema';

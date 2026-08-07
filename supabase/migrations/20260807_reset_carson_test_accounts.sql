-- Reset Carson's dormant test accounts (#185). APPLIED 2026-08-07.
--
-- Both held a paid tier with no Stripe subscription — full monthly allowance and
-- the Scale pack discount, billed to nobody. Confirmed by the owner as Carson's
-- accounts, used for testing and not in use.
--
--   rios.healthcaresolutions@gmail.com   scale   29,784 credits
--   elementp293@gmail.com                growth   3,000 credits
--
-- Neither had ever sent a message, created a lead, or held a number, so nothing
-- real was lost. Accounts are NOT deleted — tier and balance are reset, which is
-- reversible; deletion is not.
--
-- The ledger row is not optional. `npm run health` asserts
-- users.credits = SUM(points_transactions.points_amount) per user (#183), so
-- zeroing a balance without a matching negative row turns that check red. Write
-- both or neither.
--
-- Idempotent via the partial unique indexes on stripe_session_id.

INSERT INTO points_transactions (
  user_id, action_type, points_amount, description, stripe_session_id, amount_paid, created_at
)
SELECT u.id,
       'reconciliation',
       -u.credits,
       'Test-account reset (#185) — dormant account, never sent a message. Balance zeroed and tier returned to unpaid; this row keeps the ledger equal to the balance.',
       'test-account-reset-2026-08-07:' || u.id,
       0,
       now()
FROM users u
WHERE u.email IN ('rios.healthcaresolutions@gmail.com', 'elementp293@gmail.com')
  AND u.credits <> 0
ON CONFLICT DO NOTHING;

UPDATE users
   SET credits = 0,
       subscription_tier = 'unpaid',
       plan_type = 'unpaid',
       monthly_credits = 0,
       updated_at = now()
 WHERE email IN ('rios.healthcaresolutions@gmail.com', 'elementp293@gmail.com');

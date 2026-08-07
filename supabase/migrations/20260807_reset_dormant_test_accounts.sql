-- Reset the four dormant test accounts (#185). APPLIED 2026-08-07.
--
-- All four held a paid tier with no Stripe subscription — full monthly allowance
-- and the Scale pack discount, billed to nobody. Confirmed by the owner as test
-- accounts: two Carson's, two internal, none in use.
--
--   trippebrowning@gmail.com             growth  209,400 credits
--   rios.healthcaresolutions@gmail.com   scale    29,784 credits
--   trippbrowning620@gmail.com           growth    4,000 credits
--   elementp293@gmail.com                growth    3,000 credits
--
-- Two are Carson's, two are internal. NOTE the near-identical addresses:
-- tripped620@gmail.com is the REAL Scale account (59,547 credits, a live Stripe
-- subscription) and is deliberately absent from this list. Read them twice.
--
-- None had ever sent a message, created a lead, or held a number, so nothing real
-- was lost. 209,400 credits on one of them would have skewed every analytics
-- figure indefinitely. Accounts are NOT deleted — tier and balance are reset,
-- which is reversible; deletion is not.
--
-- The ledger row is not optional. `npm run health` asserts
-- users.credits = SUM(points_transactions.points_amount) per user (#183), so
-- zeroing a balance without a matching negative row turns that check red. Write
-- both or neither.
--
-- Idempotent via the partial unique indexes on stripe_session_id.
--
-- Run the INSERT and the UPDATE in ONE transaction. Applying this in two steps
-- left the ledger 32,784 points below the balances when the second was refused
-- mid-sequence — a half-applied data change that would have failed the very check
-- the ledger row exists to satisfy.

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
WHERE u.email IN (
        'trippebrowning@gmail.com',
        'rios.healthcaresolutions@gmail.com',
        'trippbrowning620@gmail.com',
        'elementp293@gmail.com'
      )
  AND u.credits <> 0
ON CONFLICT DO NOTHING;

UPDATE users
   SET credits = 0,
       subscription_tier = 'unpaid',
       plan_type = 'unpaid',
       monthly_credits = 0,
       updated_at = now()
 WHERE email IN (
         'trippebrowning@gmail.com',
         'rios.healthcaresolutions@gmail.com',
         'trippbrowning620@gmail.com',
         'elementp293@gmail.com'
       );

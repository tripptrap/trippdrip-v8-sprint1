-- Ledger reconciliation (#183) — APPLIED 2026-08-07 against the linked project.
--
-- users.credits and SUM(points_transactions.points_amount) disagreed by 109,968
-- points across 4 of 7 accounts, because add_credits and deduct_credits used to
-- move the balance without writing a ledger row. Both now do the balance write and
-- the ledger insert inside one plpgsql function, so no NEW drift accrues — but the
-- historical gap was never closed, and every points display and analytics figure
-- read from a ledger that disagreed with the balance.
--
-- Owner's decision: BALANCES WIN. Users have been spending against them, so the
-- balance is the number with real-world consequences; the ledger is the record
-- that failed to keep up.
--
--   tripped620@gmail.com                  59,547 vs   2,579   +56,968
--   rios.healthcaresolutions@gmail.com    29,784 vs    -216    +30,000
--   trippebrowning@gmail.com             209,400 vs 187,400    +22,000
--   trippbrowning620@gmail.com             4,000 vs   3,000     +1,000
--
-- rios is the clearest case: a NEGATIVE ledger against a 29,784 balance means only
-- the spends were ever recorded and the 30,000-credit grant has no row at all.
--
-- This writes ONE row per drifted account and changes NO balance. Safe because
-- points_transactions has no triggers — verified against the live catalog before
-- running, since a balance-updating trigger would have made this a double-credit.
--
-- Idempotent: stripe_session_id is covered by two partial unique indexes, so a
-- second run inserts nothing. Confirmed by running it twice (0 rows the second
-- time, 4 reconciliation rows total).
--
-- Reversible: DELETE FROM points_transactions WHERE action_type = 'reconciliation'.

INSERT INTO points_transactions (
  user_id, action_type, points_amount, description, stripe_session_id, amount_paid, created_at
)
SELECT u.id,
       'reconciliation',
       u.credits - COALESCE(s.ledger, 0),
       'Ledger reconciliation (#183) — users.credits is authoritative. Closes the gap between the balance and the transaction history that accumulated while add_credits/deduct_credits did not write ledger rows. No balance was changed by this row.',
       'ledger-reconciliation-2026-08-07:' || u.id,
       0,
       now()
FROM users u
LEFT JOIN (
  SELECT user_id, SUM(points_amount) AS ledger FROM points_transactions GROUP BY user_id
) s ON s.user_id = u.id
WHERE u.credits - COALESCE(s.ledger, 0) <> 0
ON CONFLICT DO NOTHING;

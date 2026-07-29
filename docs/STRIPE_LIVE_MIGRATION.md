# Moving Stripe off the sandbox (#81, #63, #82)

Production currently runs an `sk_test_` key against **`acct_1SPlVzFyk0lZUopF` — "TriDrip
sandbox"**. A Stripe Sandbox has no live mode, so **no real payment has ever been possible**,
and live prices cannot be created inside it. The catalog has to be rebuilt in the real account.

Written 2026-07-29. Everything below was checked against the live systems that day.

---

## What I could not do

Creating or accessing the real account needs a Stripe dashboard login, and putting the live
key into Vercel means handling an API key. Both are yours. Steps 1, 2, 5 and 6 need you; step 3
is a script; step 4 is a single SQL statement.

---

## 1. Confirm the target account

The dashboard shows **TriDrip sandbox** nested under a **HyveWyre** organisation, so a parent
account exists. Confirm it is a normal account and not another sandbox — a Sandbox shows a
badge and has no live/test toggle. Note its account id.

Also decide which email owns production billing. Three are in play and they are all different:

| where | address |
|---|---|
| Stripe account owner | `trippebrowning@gmail.com` |
| `ADMIN_EMAILS` / the app account | `tripped620@gmail.com` |
| Feb-era Stripe customers | `trippbrowning620@gmail.com` |

Account recovery depends on this, so it is worth settling before there is revenue attached.

## 2. Get the live keys

From the real account's dashboard: `sk_live_…` and `pk_live_…`. Do not set them in Vercel yet —
step 3 needs the secret key locally, and setting it in Vercel before the prices exist would
break checkout for the window in between.

## 3. Build the catalog

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-catalog.js
```

Dry run by default — it prints what it would create and changes nothing. When the plan looks
right:

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-catalog.js --apply --yes
```

It creates 11 products and prices from `lib/pointPacks.ts` — the same source `/points`,
Settings and the auto-refill picker read, so the prices cannot disagree with the app — and
prints the eleven `STRIPE_PRICE_*` lines to paste into Vercel.

It **only creates**; it never deletes, archives or edits. It is idempotent (each item carries a
`hyvewyre_key` in metadata), so re-running reuses what exists rather than duplicating.

It also fixes the naming while rebuilding (#82): products become `HyveWyre Growth Plan`,
`Starter (Growth)`, `Starter (Scale)` and so on. The sandbox says `Basic`/`Premium`, which is
what customers currently read on checkout, receipts and invoices even though the app says
Growth/Scale.

**Verified by running it against the sandbox**: created all 11, re-ran and created 0 while
reusing 11 with identical ids, then archived them — the sandbox is back to its original 12
products.

## 4. Clear the sandbox customer references

Every `users.stripe_customer_id` and `stripe_subscription_id` currently holds a **sandbox** id.
Those do not resolve against a different account, so:

- the `invoice.paid` renewal handler finds no user and alerts "renewal charged but no matching
  account" (#80) for every renewal
- `create-checkout` would attach to a customer that does not exist

There are no real payments (`payments` is empty, and `points_transactions` is test data), so
clearing is clean — the next purchase recreates them:

```sql
UPDATE public.users
   SET stripe_customer_id = NULL,
       stripe_subscription_id = NULL
 WHERE stripe_customer_id IS NOT NULL
    OR stripe_subscription_id IS NOT NULL;
```

Do this in the same window as the key swap, not before.

## 5. Set the environment

In Vercel → Production, all in one change:

- `STRIPE_SECRET_KEY` (live)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live)
- the eleven `STRIPE_PRICE_*` lines printed by step 3

**All eleven price vars must go in with the key.** They are unset in Production today (#84) and
fall back to sandbox ids hardcoded in `create-checkout/route.ts`, which resolve only because
the production key points at that same sandbox. A live key with those fallbacks means every
checkout references a price that does not exist.

Two things while you are in there:
- mark each variable **sensitive** (the toggle defaults to off, and non-sensitive variables are
  what the April 2026 incident exposed — see #29)
- **no trailing newlines**; 13 production values have one and one of them silently disabled
  email (#85)

Then **redeploy** — environment changes only apply to new builds.

## 6. Register the webhook

Add the endpoint in the live dashboard (`https://www.hyvewyre.com/api/stripe/webhook`) and set
`STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret. It is per-account **and**
per-endpoint, so the sandbox value is useless here. Every webhook fails signature verification
until this matches.

Subscribe at minimum to `checkout.session.completed`, `invoice.paid`,
`customer.subscription.updated` and `customer.subscription.deleted` — the events the handler
implements.

---

## Verify before any real traffic

```bash
node scripts/verify-secrets.js --production   # keys reachable; should report LIVE mode
node scripts/audit-stripe-prices.js           # all 10 catalog prices match, run with the live key
```

`audit-stripe-prices.js` also warns about active prices no code path references. Expect that to
be quiet in a fresh account — if it is not, something was created twice.

Then the parts no script can reach:

- **a real checkout** — the only way to prove the webhook signature and fulfilment work end to
  end. The fulfilment logic itself is verified (#92): plan, pack and renewal all grant the right
  credits, and a redelivered event does not double-grant.
- **the number-purchase path** — still unverified against real Telnyx (#30), and now unverified
  against live Stripe too.

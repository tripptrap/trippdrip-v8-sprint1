# What has to be created on the live Stripe account

Drafted 2026-08-06. **Nothing here has been created.** This is for review before
anything is written to `acct_1SPlV5FmPAhggcMQ`.

## The situation

The app has been running against `acct_1SPlVzFyk0lZUopF` — **"TriDrip sandbox"**,
a *separate account*, not test mode of the real one. The ids differ by four
characters (`1SPlV5…` vs `1SPlVz…`), which is probably how it went unnoticed.

```
live   acct_1SPlV5FmPAhggcMQ   "HyveWyre"          0 products,  0 prices
sandbox acct_1SPlVzFyk0lZUopF  "TriDrip sandbox"  12 products, 14 prices
```

Nothing carries over between accounts. Every product and price has to be created
fresh, and every id in the code repointed.

## Check this first

**Is the live account activated?** Details submitted, bank account attached,
charges enabled. Unverified — the MCP exposes no account-retrieval operation and
only sandbox keys are present locally:

<https://dashboard.stripe.com/acct_1SPlV5FmPAhggcMQ>

Activation can need business details and a payout method that take days to clear.
Building a catalogue on an unactivated account is wasted work until it does.

## Products and prices to create

Amounts come from `lib/pointPacks.ts` and `CLAUDE.md`, not from the sandbox — the
sandbox carries the old Basic/Premium naming this is meant to leave behind (#82).

### Subscriptions — 2 products, 2 prices

| Product | Price | Interval | Cents | Notes |
|---|---|---|---|---|
| **Growth** | $30.00 | month | `3000` | 3,000 credits/mo |
| **Scale** | $98.00 | month | `9800` | 10,000 credits/mo |

Name them exactly `Growth` and `Scale`. The sandbox has `HyveWyre Basic Plan` and
`HyveWyre Premium Plan`, and those names reach customer receipts — which is #82.
Creating them correctly here closes that issue for free rather than requiring a
rename later.

### Point packs — 4 products, 8 prices

**One product per pack, two prices on it** — not eight products. The sandbox made
eight (`Starter (Basic)`, `Starter (Premium)`, …), which duplicates every pack and
puts the tier name on the receipt. A single product with two prices shows the
customer "Starter Pack" either way.

| Product | Points | Growth price | Scale price |
|---|---|---|---|
| **Starter Pack** | 4,000 | $40.00 (`4000`) | $36.00 (`3600`) |
| **Pro Pack** | 10,000 | $95.00 (`9500`) | $80.00 (`8000`) |
| **Business Pack** | 25,000 | $225.00 (`22500`) | $180.00 (`18000`) |
| **Enterprise Pack** | 60,000 | $510.00 (`51000`) | $382.50 (`38250`) |

All one-time (`mode: payment`), not recurring.

Enterprise Scale is **$382.50 — 38250 cents**, the only non-round figure. Worth
checking on entry.

### Phone numbers — 1 product, 1 price

| Product | Price | Interval | Cents |
|---|---|---|---|
| **Additional Phone Number** | $1.00 | month | `100` |

Taken from the sandbox price the app currently points at
(`price_1StXaTFyk0lZUopFFJDEClnd`, $1.00/month) and the `$1.00` shown in
`components/PurchaseNumberModal.tsx`. **Confirm this is the intended price** — the
credits alternative is 100 credits/month, and $1/month against a number that costs
$1/month at Telnyx plus messaging is break-even at best.

**Total: 7 products, 11 prices.**

## Do not recreate

- `prod_TNpwKr0S2DcfyP` — `myproduct`, a test artifact
- The eight tier-suffixed pack products — replaced by 4 products × 2 prices above
- `price_1SR4GXFyk0lZUopF6z5SpLyF` — a $15 one-time price whose purpose is not
  identifiable from the code. If it is the 10DLC campaign verification fee, it
  belongs in the catalogue; **needs a decision** either way.

## Then: the env mapping

The code reads all of these. **Ten of the eleven are currently unset**, which is
why it falls through to hardcoded ids:

```bash
STRIPE_PRICE_GROWTH=price_…
STRIPE_PRICE_SCALE=price_…

STRIPE_PRICE_PACK_GROWTH_STARTER=price_…
STRIPE_PRICE_PACK_GROWTH_PRO=price_…
STRIPE_PRICE_PACK_GROWTH_BUSINESS=price_…
STRIPE_PRICE_PACK_GROWTH_ENTERPRISE=price_…

STRIPE_PRICE_PACK_SCALE_STARTER=price_…
STRIPE_PRICE_PACK_SCALE_PRO=price_…
STRIPE_PRICE_PACK_SCALE_BUSINESS=price_…
STRIPE_PRICE_PACK_SCALE_ENTERPRISE=price_…

STRIPE_PHONE_NUMBER_PRICE_ID=price_…     # currently a sandbox id
```

Plus the account switch itself: `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and a **new** `STRIPE_WEBHOOK_SECRET` — the
webhook signing secret is per-endpoint, so a new endpoint on the live account
means a new secret. Reusing the sandbox one makes every live webhook fail
signature verification.

## Then: remove the hardcoded ids

Ten sandbox price ids are hardcoded across four files. All carry the `FyK0lZUopF`
account suffix and will 404 against the live account:

| File | Count |
|---|---|
| `app/api/stripe/create-checkout/route.ts` | 10 |
| `app/api/stripe/change-plan/route.ts` | 2 |
| `app/api/stripe/webhook/route.ts` | 2 |
| `app/(dashboard)/admin/page.tsx` | 2 |

This is the underlying reason a key swap alone cannot work, and why it should be
fixed rather than repointed: with the ids in env, the same code runs against
either account and the sandbox stays usable for testing.

## What does NOT need changing

The webhook resolves points from **session metadata**
(`session.metadata.points`), not from the price id — so the points-per-pack
mapping stays in `lib/pointPacks.ts` and needs no Stripe-side metadata. Only the
ids move.

## Verifying it

1. `GET /v1/products` and `/v1/prices` on live return 7 and 11.
2. A checkout session in live mode reaches Stripe's hosted page.
3. The webhook endpoint receives `checkout.session.completed` and the signature
   verifies with the **new** secret.
4. `points_transactions` gains a `purchase` row with the right `stripe_session_id`
   — that insert is the idempotency guard, so it matters that it lands.
5. `npm run health` still passes.

Item 4 is the one that has broken before: #30 tracks a checkout-session
fulfilment fix that has never been verified against a real payment.

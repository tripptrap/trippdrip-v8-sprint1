# Production secret rotation (#29)

Runbook for rotating every production credential after the Vercel April 2026
exposure window. Written 2026-07-29; every fact below was checked against the
live systems that day, not assumed.

**Verify before you start**, per the premise of #29: hover the "Needs Attention"
badge in the Vercel dashboard and confirm what it actually means. If it turns
out to be unrelated to the incident, rotation is still reasonable hygiene, but
the urgency changes.

Run `node scripts/verify-secrets.js --production` **before and after**. It calls
each provider with the configured credential and reports what actually happened.
As of 2026-07-29 every production credential passes, so any failure afterwards
is something the rotation broke.

---

## 1. Delete these — do not rotate them

**12 production variables are read by no code at all.** Deleting is strictly
better than rotating: it removes the credential from the exposure surface
entirely and there is nothing to keep in sync.

| Variable | Why it's dead |
|---|---|
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | `next-auth` is in `package.json` but **never imported**. Auth is Supabase. |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` | Auto-added by the Vercel–Supabase integration. `lib/prisma.ts` is never imported and there is **no `schema.prisma`**, so Prisma cannot even initialise. |
| `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_URL` | Unprefixed duplicates. The code only reads the `NEXT_PUBLIC_` versions. |

`POSTGRES_PASSWORD` is a live database credential sitting unused — it is the
best argument for doing this step first.

**Before deleting:** these were added by the Supabase integration, which may
re-add them. Delete, trigger a preview deploy, confirm it builds and runs, then
delete from Production. If the integration re-adds them, leave them and rotate
the database password in Supabase instead.

Consider also removing the dead `next-auth`, `prisma` and `@prisma/client`
dependencies and `lib/prisma.ts` — separate change, but it's what makes the
deletions above provably safe.

---

## 2. Rotate in this order

Ordering matters in three places. Everything else is independent.

### 2a. `ENCRYPTION_KEY` — do this first, the window is open

**Verified 2026-07-29: `porting_orders` has 0 rows and 0 non-null `account_pin`.
Nothing is encrypted.** Rotate now and it costs nothing. Rotate after the first
real port order and that customer's PIN becomes permanently undecryptable and
you need a decrypt/re-encrypt migration.

The stored value also has a **trailing newline**, and `lib/encryption.ts` reads
it untrimmed — so the newline is currently part of the key material (#85).
Because you are replacing the key anyway, this is the moment to drop it. Set the
new value with no trailing whitespace.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`lib/encryption.ts` expects exactly 64 hex characters.

### 2b. Supabase — anon and service_role move together

Rotating the service_role key means rotating the project's JWT secret, which
**also invalidates the anon key and signs out every logged-in user**. Update
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the same
change, and expect all sessions to drop.

Highest blast radius of anything here: the service_role key bypasses every RLS
policy and can read and write every tenant's data. If you rotate only one thing,
rotate this.

### 2c. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — probably skip

**Production currently runs an `sk_test_` key against the "TriDrip sandbox"
account (#81).** These are sandbox test credentials; rotating them protects
nothing real. Do this as part of standing up the live account (#63/#81) rather
than here, and note the webhook secret is per-endpoint — after rotating, the
value in Vercel must match the endpoint's signing secret in the Stripe
dashboard, or every webhook fails signature verification.

### 2d. Independent — rotate any time, in any order

| Secret | Notes |
|---|---|
| `TELNYX_API_KEY` | Zero-downtime: create the new key in the Telnyx portal, set it in Vercel, redeploy, **then** delete the old one. Spends real money if leaked. |
| `OPENAI_API_KEY` | Same add-then-delete pattern. |
| `SENDGRID_API_KEY` | Same. |
| `CRON_SECRET` | Self-contained — Vercel Cron injects this itself, so there is no external caller to update. Generate with `openssl rand -base64 32`. |
| `SYSTEM_API_KEY` | Internal only; both caller and callee read the same variable, so rotation is atomic. Currently has trailing whitespace (#85) — drop it. |
| `GOOGLE_CLIENT_SECRET` | **1 of 7 users has Google Calendar connected.** Rotating may invalidate that grant and require them to reconnect. Low cost today; higher after launch. |

`TELNYX_PUBLIC_KEY` is Telnyx's *public* signing key for webhook verification,
not a secret of yours. Don't rotate it; just confirm it still matches the portal.

---

## 3. While you're in there

- **Mark every variable "sensitive"** when re-adding. The toggle defaults to
  **off**, and non-sensitive variables are exactly what the April 2026 incident
  exposed.
- **Strip trailing newlines.** 13 of 33 production values have one (#85). Most
  are harmless, but `SERVICE_EMAIL_PROVIDER` broke an exact string comparison and
  `ENCRYPTION_KEY` makes them part of the key material. Paste carefully.
- **Set the 11 `STRIPE_PRICE_*` variables** (#84). They are unset in Production
  and currently resolve only because the hardcoded fallbacks belong to the same
  sandbox the production key points at. They must be set in the same change as a
  live Stripe key or checkout breaks for every customer.
- **Redeploy.** Environment changes apply to new builds only — setting a variable
  does not affect the running deployment.
- **Update `.env.local`** in lockstep so local development keeps working. Note it
  is currently missing `SYSTEM_API_KEY` entirely.
- **Delete or refresh `.env.vercel.production`** in the repo. It is a Feb 3
  snapshot, already out of date, and it caused one wrong conclusion (#83).

---

## 4. Verify

```bash
node scripts/verify-secrets.js --production
```

Expected after a clean rotation: every live credential ✅, with warnings only for
the Stripe sandbox (until #81) and anything deliberately deferred. The script
pulls production values into a temp directory and deletes them in a `finally`,
and never prints a secret — only a prefix and length.

Then exercise the paths the script cannot reach offline:

- **Stripe webhook** — signature verification only proves out on a real event.
- **Google OAuth** — reconnect Calendar on the one account that has it.
- **Cron** — confirm a scheduled run succeeds after `CRON_SECRET` changes;
  a mismatch returns 401 and the crons simply stop, quietly.

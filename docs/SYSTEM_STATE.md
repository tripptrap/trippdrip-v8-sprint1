# System State — Read This Before Starting Work

**Purpose:** this is the "how it actually works, what's actually broken" doc — not
aspirational docs, not a changelog (git log is the changelog). Every fact here was
confirmed against live code, live data, or a live API call, not assumed from training
data or a README. When training-data assumptions and reality disagreed this session
(Stripe object shapes, a DB column that didn't exist despite code assuming it did), the
gap cost real time to rediscover. This file exists so that cost is paid once, not every
session.

**Maintenance rule — this is not optional:** whenever you (a) fix a bug whose root
cause reveals how a system really behaves, (b) discover a gap between what the code
assumes and what's actually true (a missing column, a wrong API shape, a silent
no-op), or (c) ship a change that alters how a subsystem works end-to-end — update the
relevant section below in the same session, before moving on. Don't wait to be asked.
If a fact here turns out to be stale or wrong, fix it in place rather than leaving it —
a wrong "known state" is worse than no doc at all. Keep entries factual and dated where
the date matters; prune anything superseded rather than appending forever (this is a
current-state snapshot, not a diary — that's what `git log` and closed GitHub issues
are for).

---

## Billing & Subscriptions (Stripe)

**How it actually works (as of 2026-07-28):**
- Initial subscription: `/api/stripe/create-checkout` → Stripe Checkout → webhook
  `checkout.session.completed` (mode=`subscription`) grants the first month's credits,
  saves `stripe_customer_id`/`stripe_subscription_id`, and sets `next_renewal_date`
  from the real subscription period.
- Monthly renewal: webhook `invoice.paid` with `billing_reason: 'subscription_cycle'`
  grants that month's credits server-side. Gated on `subscription_cycle` specifically
  so it never double-fires against the initial `checkout.session.completed` grant
  (which corresponds to `billing_reason: 'subscription_create'`) or against proration
  invoices from a plan change (`subscription_update`).
- Plan switch (upgrade/downgrade): `/api/stripe/change-plan` looks up the user's real
  `stripe_subscription_id` and calls `stripe.subscriptions.update` to actually move the
  subscription item to the new price (`proration_behavior: create_prorations`), then
  syncs Supabase. **Do not** write `subscription_tier` to Supabase without also calling
  Stripe — that was the bug fixed 2026-07-28 (see below).
- Pause billing (alternative to downgrade): `/api/stripe/pause-subscription` uses
  Stripe's `pause_collection: { behavior: 'void', resumes_at }`. `resumes_at` is
  computed from the subscription item's real `current_period_end`, not a flat 30/60
  day guess.
- `customer.subscription.updated`/`.deleted` webhook handlers keep Supabase in sync if
  a subscription changes outside the app (Stripe portal, dashboard, a pause/resume).
- Idempotency: duplicate webhook deliveries are rejected via a partial unique index on
  `points_transactions.stripe_session_id` (non-null values only — ordinary spend rows
  have no session id and aren't affected). This constraint didn't actually exist until
  2026-07-28 even though the code's comments claimed it did.

**Gotcha — verify Stripe object shapes empirically, every time:** this account's
default Stripe API version has restructured several objects vs. the "classic" shape
most training data and docs assume:
- `current_period_end`/`current_period_start` live on `subscription.items.data[0]`, not
  on the top-level `Subscription` object.
- `invoice.subscription` doesn't exist — the subscription id is at
  `invoice.parent.subscription_details.subscription`.
- `checkout.session.subscription` is **not** affected — that one's still top-level.
- Before writing any new Stripe-touching code, retrieve a real object from the test API
  (`node -e "..."` with the Stripe SDK, using `.env.local`'s test key) and inspect it
  directly rather than trusting a remembered shape. This bit twice in one session
  before the pattern was established.

**Current mode:** Stripe is in **test mode**, both locally and in production, as of
2026-07-28 (confirmed with the user directly — don't assume, ask if this ever seems
like it might have changed before doing anything that touches real subscriptions).

**Known state of existing data:** every pre-2026-07-28 user in production has
`stripe_customer_id = null` and no real Stripe subscription behind their tier —
checked directly, these are pre-launch test/dev signups, not real customers who got
disconnected. Nothing needed backfilling. Going forward, real signups get both IDs
captured correctly.

**Data inconsistency to be aware of:** `lib/subscriptionFeatures.ts`'s
`SUBSCRIPTION_FEATURES.{growth,scale}.pointPackDiscount` (flat 10% / 30%) and
`app/(dashboard)/points/page.tsx`'s `POINT_PACKS` table (actual per-pack discounts:
5–15% for Growth, 10–30% for Scale, varying by pack size) are **not the same numbers**
and aren't derived from one source of truth. If asked to compute or display "the
discount," check which of these two the surrounding code already uses before picking
one — they will disagree.

---

## SMS / Telnyx / 10DLC

**The thing that actually blocks new users from texting:** a freshly-ordered *local*
number cannot reliably send SMS until it has a `messaging_campaign_id` set on the
Telnyx side. Local number *ordering* itself is not gated by 10DLC status — only actual
message throughput is. Confirmed 2026-07-28 by pulling the live Telnyx record for a
real production number: `"messaging_campaign_id": null`. Even after a campaign is
approved, a number isn't auto-linked to it — linking is a manual step ("Assign my
number" in Settings → Messaging Registration).

**The workaround, and its real limit:** the "Instant Access" shared number pool
(`number_pool` table) holds pre-verified toll-free numbers — toll-free verification is
a separate, faster carrier process, unrelated to 10DLC brand/campaign status. Onboarding
tries to claim from this pool first, before falling back to ordering a fresh (unverified)
local number. **As of 2026-07-28 there are only 3 numbers in the pool, all toll-free.**
Past the first few signups, or for anyone who searches a specific area code instead of
taking a pool number, onboarding falls back to the broken local-number path. This is a
real capacity ceiling, not just a marketing-copy issue — related to GitHub issues #2/#3
(scaling number ordering in batches), though neither issue currently states this
consequence explicitly.

**10DLC campaign status:** see `docs/10DLC_REJECTION_HISTORY.md` for the full
submission history, every verbatim rejection reason, and the fix for each. As of
2026-07-27, campaign `4b30019f-a63a-3fb0-9c87-1ff6d84e7ac6` (brand `4b20019b-...`,
VERIFIED) is `TCR_PENDING` — passed Telnyx's own validation, awaiting the carrier's
actual decision. **Never submit anything to Telnyx without the user's unambiguous,
explicit instruction to submit** — this was violated once earlier and must not happen
again.

**HELP/START/STOP:** implemented in the SMS webhook (`app/api/telnyx/sms-webhook`) —
these keywords were declared in every 10DLC campaign submission for months before
actually being wired up in code, which was itself one of the rejection causes. Fixed
2026-07-27.

---

## Phone Numbers

`user_telnyx_numbers.capabilities` — as of 2026-07-28 morning, this column **did not
exist in the database at all**, despite `app/(dashboard)/phone-numbers/page.tsx`
unconditionally reading `number.capabilities.sms/.voice/.mms` on every row. This
crashed the whole page for any account with a purchased number. Patched with optional
chaining as an immediate stopgap, then fixed at the root: migration
`fix_user_telnyx_numbers_capabilities.sql` adds the column (default
`{voice:true, sms:true, mms:true}`, applied to this app's numbers because everything
provisioned here is SMS-filtered at order time), backfills existing null rows, and all
5 insert/upsert paths into this table now set it. **If you see a route or migration
that assumes a column exists, don't trust it — query `information_schema.columns`
directly before relying on it.**

---

## Theme / Design

Near-black dark theme, chosen 2026-07-28 from a 5-option side-by-side comparison
(near-black / charcoal / cool slate / warm grey / white). Implementation:
`tailwind.config.ts` overrides both the `sky` palette (accent — buttons, active nav,
links; retinted from blue to neutral grey) and the `slate` palette (page background /
card / border / text ramp; dark stops pushed to near-black, light stops left alone so
light mode isn't affected). Corner radii tightened site-wide via the same config file.
Colored CTA buttons (amber/emerald/red/orange/green — Compose, Delete, etc.) use an
outline treatment (transparent background, colored border + text) rather than solid
fill — a deliberate choice from a 4-option comparison, don't revert without asking.
Emoji were removed from Settings → Account section headers specifically because every
*other* header on that page was already plain text with no icon — that's the page's
real established convention, follow it rather than inventing a new icon treatment.

**Gotcha:** editing `tailwind.config.ts` does not reliably hot-reload in this dev
server setup. If a config change doesn't visibly take effect, fully stop and restart
the preview server before concluding the change is wrong.

---

## Credits / Points System

Costs and tier amounts are documented in the main `CLAUDE.md`. Renewal (monthly credit
grant) is now driven server-side by real Stripe billing (`invoice.paid`, see Billing
section above) — it used to be a client-side function (`checkAndRenewCredits` in
`lib/renewalSystem.ts`, called from `Topbar.tsx` on every page load) that granted a
bonus month of credits to every new signup the moment they first opened the dashboard,
because it treated a `null` `next_renewal_date` as "renewal overdue." That function was
removed entirely 2026-07-28; `getDaysUntilRenewal()` (a pure read) is the only thing
left in that file.

---

## Known open gaps (not yet fixed, worth checking before assuming otherwise)

- **10DLC campaign-tier-by-subscription-tier (#11):** blocked on the current campaign
  (#1) clearing carrier review — don't build this yet, see #11's own text for why.
- **Landing page accuracy (#33):** `/preview` likely has feature claims that don't
  match current reality (Flows/Receptionist split, pause-billing, near-black theme,
  etc.) — not yet audited.
- **Number-purchase checkout doesn't fulfill:** noted in `CLAUDE.md`'s In Progress
  section as being worked on in worktree `priceless-kowalevski-e9b46d` — that worktree
  had not diverged from a commit already on `main` as of 2026-07-28, so it's unclear
  whether this was ever actually started. Check before assuming it's handled.
- **Secrets rotation (#29):** deliberately deferred to pre-launch prep. The app running
  normally is not evidence the current secrets are safe.
- **Pool capacity:** see SMS/Telnyx section above — only 3 toll-free numbers exist in
  the instant-access pool right now.

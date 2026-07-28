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

**The workaround, and why it's currently fake too:** the "Instant Access" shared number
pool (`number_pool` table) is supposed to hold pre-verified toll-free numbers — toll-free
verification (TFV) is a separate, faster carrier process, unrelated to 10DLC brand/campaign
status. Onboarding tries to claim from this pool first, before falling back to ordering a
fresh (unverified) local number. **As of 2026-07-28 there are only 3 numbers in the pool,
all toll-free, and NONE of them are actually TFV-verified**, despite `is_verified: true`
and `friendly_name: "Verified Toll-Free #N"` in the database. Verified by querying Telnyx's
real verification endpoint (`GET /v2/messaging_tollfree/verification/requests`) directly:
**zero verification requests exist on the account, for these numbers or any others.**
The numbers themselves are real and active (`+18887062631`, `+18886638510`, `+18884610148`,
on messaging profile "HyveWyre LLC", A2P-eligible) — only the verification step is missing
right now. **Explanation for the 5-month gap between the `number_pool` row creation date
(2026-02-05) and the Telnyx `purchased_at` date (2026-07-26), per the user 2026-07-28:**
5 toll-free numbers were originally purchased around Feb 2026 (matching the `number_pool`
row creation date — the DB rows and `is_verified: true` reflect that original purchase,
not fake seed data as first suspected). The Telnyx account was later deactivated for
non-payment; on reactivation 2 of the 5 numbers had already been taken by other customers,
and only 3 were recoverable — hence `purchased_at: 2026-07-26` on the Telnyx side for
numbers whose DB rows are 5 months older. **Unconfirmed (user recalls submitting TFV
originally, will verify 2026-07-28):** the user's recollection is that verification *was*
required and submitted for the original 5 numbers back in February — which would mean the
deactivation/recovery cycle is what wiped it, not that it was skipped entirely. Not yet
confirmed against any record on either side (Telnyx currently shows zero verification
requests on the account, as noted above, which cuts against the recollection but doesn't
rule out Telnyx having purged the record on deactivation). Treat as unconfirmed until
checked. Doesn't change the fix either way — see below — but matters for whether this is
"redo lost verification" or "do it for the first time."
**Practical effect: the "Instant Access" pool most likely does not currently bypass carrier
filtering any better than an unregistered local number does** — a new signup claiming one
of these still probably hits throughput problems, just via unverified-toll-free filtering
instead of missing-`messaging_campaign_id` filtering. Don't assume claiming a pool number
during onboarding actually lets a new user send SMS reliably until this is fixed (submit
real TFV requests for these 3 numbers) and re-verified live. **Do not submit a TFV request
without the user's unambiguous, explicit instruction** — same rule as 10DLC submissions,
see below.

Separately, even if TFV is fixed: **as of 2026-07-28 there are only 3 numbers in the pool**.
Past the first few signups, or for anyone who searches a specific area code instead of
taking a pool number, onboarding falls back to the broken local-number path. This is a
real capacity ceiling, not just a marketing-copy issue — related to GitHub issues #2/#3
(scaling number ordering in batches), though neither issue currently states this
consequence explicitly.

**Recycling risk:** both `app/api/telnyx/release-number/route.ts:94-100` and account
deletion (`app/api/user/delete-account/route.ts:84-87`) flip a released pool number back
to `is_assigned: false`, returning it to the pool for a **different, unrelated business**
to claim later. Even once TFV is real, a number that picked up spam reports or carrier
flags under one tenant's traffic carries that reputation into the next tenant — a
practical throughput/reputation risk on top of the verification gap above.

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

**STOP opt-outs were never actually persisted — TCPA-level bug, fixed 2026-07-28.**
Detection worked; persistence did not. The opt-out handler wrote to `dnc_list` directly
with `onConflict: 'user_id,phone_number'` (no such constraint → `42P10`) and omitted
`normalized_phone` (NOT NULL, no default, no trigger), then separately inserted into
`dnc_history` with three columns that don't exist on that table (`reason`, `source`,
`notes`) while omitting two that are NOT NULL (`normalized_phone`, `list_type`). Both
writes failed every time. Neither return value was error-checked, and supabase-js
returns `{ error }` instead of throwing, so the surrounding `try/catch` never fired and
the handler logged `✅ Added to DNC list` on every failure. **Confirmed by the data:
`dnc_list` had 0 rows — no opt-out had ever been recorded.** The only surviving effect
was `leads.sms_opt_in = false`, which **nothing reads** — grep confirms no send path
checks it. Every send path gates on the `check_dnc` RPC, which matches on
`normalized_phone` in `dnc_list`, so it returned `on_dnc_list: false` forever and leads
kept receiving messages after texting STOP. Fixed by calling the purpose-built
`add_to_dnc` RPC (owns normalization, dedup, and `dnc_history` logging) with a loud
error check. **Rules this leaves behind:** (1) write DNC entries only via `add_to_dnc`,
never direct table writes — `check_dnc` matches on `normalized_phone`, so an entry
missing it is invisible to enforcement; (2) `leads.sms_opt_in` is currently decorative,
so don't treat it as a compliance backstop unless you also wire it into the send paths.

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

**`onConflict` targets must match a real unique constraint (fixed 2026-07-28).** Three
upserts into `user_telnyx_numbers` used `onConflict: 'user_id,phone_number'`, but the
table's only unique index is on `phone_number` alone — so every one of them failed at
runtime with Postgres `42P10` ("no unique or exclusion constraint matching the ON
CONFLICT specification"). Fixed to `onConflict: 'phone_number'` in
`app/api/stripe/webhook`, `app/api/stripe/create-number-subscription`, and
`app/api/number-pool/purchase-with-credits`. **The generalizable lesson: supabase-js
`onConflict` is not validated at build time and the failure comes back as a returned
`{ error }` rather than a thrown exception — so an unchecked upsert fails completely
silently.** Verify the constraint exists (`pg_indexes` / `pg_constraint`) before
writing an `onConflict`, and always check the returned error.

**Number-purchase checkout fulfillment (fixed 2026-07-28, was GitHub #10's sibling
bug).** `create-number-subscription`'s checkout-session branch (used when the user has
no existing active subscription) creates a Stripe Checkout Session with
`metadata: { phone_number, type: 'additional_number' }` and relies entirely on the
webhook to fulfill. The webhook had no handling for it at all — customer got charged,
number never ordered. Worse: that session uses `mode: 'subscription'`, so it fell
through into the plan-subscription branch and would have been treated as a **Growth
plan purchase** (granting 3000 credits and setting a tier). Now handled by a
`phoneNumberPurchase` branch that runs *before* the `session.mode` check — order that
matters, don't reorder it. The branch is idempotent (checks `user_telnyx_numbers` by
phone first), refuses to reassign a number already owned by a different user, and
**blocks the order entirely for toll-free numbers that aren't TFV-verified** — which,
given the pool findings above, is currently every toll-free number on the account.

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

## Tags, AI Flows, and Campaigns — how they actually connect

These three used to be independent concepts (per the original CLAUDE.md design docs).
As of the "AI overhaul" work (flow_id/flow_step_order/ai_instruction/field_name
migration), **Tags are now the actual step data for Flows** — verified directly
against the `tags` table schema and `app/api/telnyx/sms-webhook/route.ts`'s
step-advancement logic:

- `tags.flow_id` + `tags.flow_step_order`: a tag with a non-null `flow_id` *is* one
  step of that flow, ordered by `flow_step_order`. A tag with `flow_id = null` is a
  plain pipeline-stage tag, unrelated to any flow.
- `tags.field_name` + `tags.ai_instruction`: only tags with a `field_name` set count
  as *collectible* steps. `field_name` is the key the extracted answer gets saved
  under on the lead; `ai_instruction` (falling back to the tag's own `name` if unset)
  is literally what's injected into the AI's system prompt as the current step's
  instruction.
- Step gating (`app/api/telnyx/sms-webhook/route.ts` around the flow-advancement
  block): on each inbound message, the webhook loads the lead's assigned flow's step
  tags ordered by `flow_step_order`, finds the *first* step whose `field_name` isn't
  yet present in the lead's collected data — that's the only step whose
  `ai_instruction` gets surfaced to the AI this turn. When the AI extracts a value for
  that field from the reply, the step is marked complete and `primary_tag` is set to
  that step's tag name (this is what drives the visible pipeline-stage badge on the
  lead). It only ever exposes the *current* step, not future ones — hence
  "step-gated."
- **Campaigns connect to Flows via `campaigns.flow_id` + `campaigns.auto_trigger_flow`**
  (both real, both wired into the webhook — verified, not just present in the schema):
  when an inbound reply comes from a lead with no flow assigned yet, the webhook
  checks the lead's campaign; if `auto_trigger_flow` is true and the campaign has a
  `flow_id`, that flow gets auto-assigned to the lead on the spot. This is the actual
  mechanism behind "user chooses whether AI Flow takes over automatically or stays
  manual (configurable per campaign)" — it's real, not aspirational.
- Tags are still independently assignable outside of any flow (manual pipeline-stage
  tagging in the Leads UI) — the flow-step relationship is additive, not exclusive.

---

## Leads vs. Clients — how the split actually works

Verified against `app/api/leads/disposition/route.ts` and `app/api/texts/threads/route.ts`:

- Marking a lead "sold" (`disposition: 'sold'`) **inserts a new row into `clients`**
  (copying name/phone/email/tags/campaign/etc. from the lead) and updates the
  *original* `leads` row with `status: 'sold', converted: true, client_id: <new client
  id>`. The lead row is never deleted — `leads` and `clients` are two separate tables
  connected by `leads.client_id`.
- The Messages inbox's Leads/Clients tab split (`contact_type`) is **not a stored
  column** — it's computed on every read in `/api/texts/threads` as
  `(isConverted || hasClientRecord || phoneClient) ? 'client' : 'lead'`. This means a
  thread automatically reclassifies from the Leads tab to the Clients tab the moment
  its lead is marked sold, with no separate migration/backfill step needed — the
  design is self-correcting by construction, not something that can drift out of sync.

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
- **Landing page needs a real capability audit (#33), user flagged 2026-07-28:**
  `/preview` (`app/(public)/preview/PreviewClient.tsx`) needs to actually describe what
  HyveWyre does today, not an older or aspirational version of it. Concretely stale as
  of this writing: the Tags/Flows/Campaigns step-driven AI progression (see section
  above — this is a real, working mechanism the landing page doesn't describe at all),
  the Leads→Clients conversion flow, pause-billing as an alternative to downgrading,
  the near-black theme/redesign. Don't assume any specific landing-page claim is
  accurate without checking it against this doc or the actual running app first.
- **Live Telnyx number-order call is still unverified (2026-07-28):** the
  number-purchase checkout bug itself is fixed (commit `b28e8cb`, see Phone Numbers
  section), and every surrounding path is tested with signed Stripe events — but the
  actual `POST /v2/number_orders` call inside the `phoneNumberPurchase` branch has
  never run against real Telnyx, because executing it places a real billable order.
  To verify: buy a **local** number (toll-free is correctly blocked while TFV is
  missing) via checkout as a user with no active subscription, then confirm the row
  lands in `user_telnyx_numbers` with `status: 'pending'` and the number shows on the
  Telnyx account. **Needs the user's explicit go-ahead — it spends money.** Note the
  fix was ported from worktree `priceless-kowalevski-e9b46d`, where it had been left
  uncommitted and unmerged; that worktree still holds the now-redundant copy.
- **Secrets rotation (#29):** deliberately deferred to pre-launch prep. The app running
  normally is not evidence the current secrets are safe.
- **Instant-access pool is unverified + capacity-limited (found 2026-07-28):** see
  SMS/Telnyx section above — the 3 toll-free pool numbers have `is_verified: true` in
  the database but zero real TFV requests on the Telnyx account, so the pool likely
  doesn't actually solve the new-signup-can't-text problem it exists to solve. Fixing
  this needs (1) real TFV submissions for the 3 existing numbers, with the user's
  explicit go-ahead first, and (2) more pool capacity than 3 numbers long-term.

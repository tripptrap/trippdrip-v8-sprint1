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

**The workaround, and it genuinely works:** the "Instant Access" shared number pool
(`number_pool` table) holds TFV-verified toll-free numbers — toll-free verification (TFV)
is a separate, faster carrier process, unrelated to 10DLC brand/campaign status. Onboarding
tries to claim from this pool first, before falling back to ordering a fresh (unverified)
local number. **All 3 pool numbers (`+18887062631`, `+18886638510`, `+18884610148`) are
confirmed TFV-Verified** under request `6723e639-83ee-5c48-9ec7-b550fdce868c` (status
`Verified`, created 2026-01-10, covering all 5 originally-purchased numbers). Two earlier
requests (`65ad888e`, `e719b1df`) were Rejected before that one passed — so TFV, like 10DLC,
took multiple attempts here.

> ⚠️ **Read this before "discovering" that the numbers are unverified.** On 2026-07-28 this
> file asserted the exact opposite — that zero TFV requests existed and the pool was fake.
> **That was wrong**, and the cause is a trap worth not repeating: `GET
> /v2/messaging_tollfree/verification/requests` returns its array under **`records`**, not
> `data`. An ad-hoc script reading `body.data` gets `undefined` → reports zero → looks like
> conclusive proof that nothing was ever submitted. `lib/telnyx.ts`'s
> `getVerifiedTollFreeNumbers()` handles this correctly (`data.records || data.data`), so
> **the app was always right and the throwaway verification script was wrong.** Also note
> the endpoint 400s without explicit `page`/`page_size` params. If a quick script ever
> contradicts a working code path, suspect the script first.

**Declared use-case (from the approved TFV request) — this is the compliance model:**
HyveWyre is registered as an **ISV/reseller**, `ISV Reseller: HyveWyre LLC`, use-case
`Conversational / Alerts`, expected volume 10,000/month. The submission states each client
business gets **its own dedicated toll-free number, provisioned 1:1** ("one insurance agency
= one toll-free number… No single business uses more than one number"), that HyveWyre does
not send messages itself — clients do, to their own prior-express-written-consent contacts —
and that consent is enforced at the platform level. **This answers whether pooling numbers
across different businesses is legitimate: yes, in the 1:1 form that's declared.** The claim
route (`app/api/number-pool/claim/route.ts`) enforces exactly that — a guarded
`UPDATE … WHERE is_assigned = false` gives one number to one user at a time. Do not change
the pool to share a single number across concurrent businesses; that would contradict the
approved filing.

**Real capacity ceiling: 3 verified numbers = 3 client businesses**, given the declared 1:1
model. Past that, or for anyone who searches a specific area code instead of taking a pool
number, onboarding falls back to the local-number path that's still gated on 10DLC. That's
the substance of #2/#3 — scaling inventory means submitting *new TFV batches*, not just
buying more numbers.

**Recycling risk:** both `app/api/telnyx/release-number/route.ts:94-100` and account
deletion (`app/api/user/delete-account/route.ts:84-87`) flip a released pool number back
to `is_assigned: false`, returning it to the pool for a **different, unrelated business**
to claim later. Sequential reassignment doesn't break the declared 1:1 model, but a number
that picked up spam reports or carrier flags under one tenant's traffic carries that
reputation into the next tenant.

**TFV status is now visible in-app** (#43, 2026-07-29): **Settings → Messaging**, below the
10DLC panel. Any user sees their own toll-free numbers and whether each is verified; an
admin (`ADMIN_EMAILS`) also sees the shared pool with **stored vs. live** verification side
by side — drift between `number_pool.is_verified` and Telnyx is highlighted — plus the full
request history including the two rejections and their reasons. Backed by
`GET /api/telnyx/tollfree-status`.

**The rule that panel encodes:** `lib/telnyx.ts` now exposes `getTollFreeVerification()`,
which returns `{ ok, error, requests, verified }`. **A failed Telnyx read produces zero
verified numbers, which is indistinguishable from "nothing is verified" if you only look at
the set** — that conflation *is* the 2026-07-28 scare. So anything that displays this must
branch on `ok` first; the UI renders "Unknown" plus an explicit unreachable banner, never
"Not verified". Failed reads are deliberately **not cached**, or a transient outage would
pin a false negative for five minutes and the Refresh button couldn't clear it.
`getVerifiedTollFreeNumbers()` is unchanged and still fails closed (empty set on error) —
six routes *gate* on it, and for gating, empty is the safe answer. Verified against a valid
key (3 requests, 5 verified), an invalid key (`ok:false`, HTTP 401), and a missing key.

`number_pool.is_verified` is still an independently-set flag (#36 reconciles it); the admin
table above is what makes drift in either direction visible rather than assumed.

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

### The 10DLC campaign is approved; the number cannot attach to it (#105, 2026-07-30)

Campaign `CAAP953` / `4b30019f-a9aa-5d53-15ff-8fab24597ea8` is `MNO_PROVISIONED`, T-Mobile
registered, no failure reasons, all seven MNOs APPROVED. Assigning `+18134972176` fails:

```
attNumberMappingStatus:        FAILED
tmobileNumberMappingStatus:    FAILED
nonTmobileNumberMappingStatus: ADDED
errors: "Longcode cannot be added/deleted as it is already associated with another campaign."
```

**The reason lives in `errors`, not `failureReasons`** — that field stayed `null` throughout, so
a check that only reads `failureReasons` sees a failure with no explanation. Read both.

Five dead campaigns exist under the brand and one still holds the number at AT&T/T-Mobile. The
Telnyx API shows only our assignment, and `filter[campaign_id]` on
`GET /10dlc/phone_number_campaigns` is ignored — every campaign returns the same single global
record — so the holder cannot be found programmatically. Needs Telnyx support; the request is
written out in #105. Retried once with a full delete between attempts, same result.

### A user's first number must be primary — it was not (#104, 2026-07-30)

`user_telnyx_numbers.is_primary` defaults to `false`, and **none of the four insert paths set
it** (`telnyx/purchase-number`, `number-pool/claim`, `number-pool/purchase-with-credits`,
`telnyx/number-order-webhook`). **Eight read paths require it** — bulk scheduling, AI drip
start, SMS alerts, draft replies, the 10DLC status and assign-number routes among them, all
using `.eq('is_primary', true)`.

So every user who finished onboarding received a number they **could not send from**. The one
real account showed it: `+18134972176`, `is_primary: false`.

**Why nobody noticed:** the inbound SMS webhook uses `.order('is_primary', …)` rather than
`.eq`, so receiving worked fine. Only outbound was dead, and it failed by finding no number
rather than by erroring.

Fixed with a `BEFORE INSERT` trigger (`ensure_primary_telnyx_number`) rather than by patching
the four routes — a fifth would forget the same way. It only promotes, never demotes an
explicit `true`. A partial unique index enforces at most one primary per user, because several
read paths `.single()` on that filter and would error on two rows.

**Rule:** when a column is required by read paths but optional at insert, put the invariant in
the database. Four routes agreeing today is not four routes agreeing next month.


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

**Auto-refill charges the same prices as `/points`, and only for real packs** (#76,
2026-07-29). `/api/cron/auto-buy` used to carry a *third* private pack table —
500/1K/2.5K/5K/10K at $5/$10/$23.75/$45/$85 — plus a hardcoded flat 30% Scale discount.
Only the 10K size resembled a real product and it was $10 under; a Scale user refilling
10,000 points would have been charged **$59.50 against a catalog price of $80**. Nothing
was ever mischarged (0 users with `auto_topup = true`, 0 auto-refill transactions, 0
payments at the time of the fix), but it was fully wired: Settings writes
`users.auto_topup*` and the cron reads them hourly via `vercel.json`.

Now: pack choice and price both come from `lib/pointPacks.ts`. `packForPointsAmount()` is
shared by the Settings picker and the cron **on purpose** — if the UI and the charge
disagree about which pack an amount means, the user is surprised by their bill. It rounds
*up* to the smallest covering pack, since under-delivering defeats the point of auto-refill.

The Settings control is now a **pack picker**, not a free-form number. The old number input
(100–10000, step 100) displayed an "estimated cost" of `amount × $0.01` — a fourth price
that existed nowhere else. For 10,000 points there were four disagreeing figures: that
estimate said $100, the cron charged $85 (or $59.50 on Scale), and `/points` sells it for
$95/$80. Auto-buy can only charge for a purchasable pack, so the choice has to be a pack.

**Legacy data:** every existing row still holds `auto_topup_amount = 500`, which is not a
pack size. It resolves to Starter (4,000 pts, $40/$36). The Settings page snaps the loaded
value through the same resolver so the UI shows the pack that would actually be charged.

**Never reintroduce a discount percentage constant.** The discount *is* the difference
between `basePrice` and `premiumPrice` in the catalog. A standalone percentage is what
#39 removed and what made this route undercharge.

**Stripe is the one price source that cannot derive from the catalog**, because the amount
lives in Stripe and its prices are **immutable** — you cannot edit an amount, only create a
new price and repoint the env var. So it's the remaining place the catalog can silently
drift from what customers are actually charged. `scripts/audit-stripe-prices.js` checks all
ten (8 packs + 2 plans) against `lib/pointPacks.ts` and exits non-zero on any mismatch;
it parses the catalog out of the source rather than duplicating the numbers. As of
2026-07-29 all ten match in TEST mode. Run it after changing pack pricing, and on both
sides of the switch to live keys (#63).

Immutability also means **every price change leaves the old price behind, active and still
chargeable**, unless someone archives it. Three such strays exist (`$187.50` on Business
Premium, `$420` on Enterprise Premium — both pre-#39 figures — plus a `$15` "myproduct"),
so the audit warns on any active price no code path references.

### Production env was cut from 33 vars to 21 (#29)

On 2026-07-29 twelve Production variables were **deleted**, not rotated, because
no code path reads any of them: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, the seven
`POSTGRES_*` vars, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY` and `SUPABASE_URL`.

Why they were dead: **`next-auth` is in `package.json` but never imported** (auth
is Supabase), and **`lib/prisma.ts` is never imported with no `schema.prisma`
anywhere**, so Prisma cannot initialise — which made every `POSTGRES_*` var,
including a live `POSTGRES_PASSWORD`, pure unused attack surface. The three
unprefixed `SUPABASE_*` vars are duplicates; code reads only `NEXT_PUBLIC_*`.

Proven rather than assumed: deploy `403a1a7` built and ran without them, the
public `/opt-in/<slug>` page still renders its business name from the database,
and `/api/telnyx/tollfree-status` still returns 401 (so the Supabase auth client
initialises). Env changes apply only to new builds, so the deletion was inert
until that deploy — that gap is the safety window if this is ever repeated.

`next-auth`, `prisma`, `@prisma/client`, `@auth/prisma-adapter` and `pg` were removed in #86,
along with `lib/prisma.ts` — the only file that imported any of them, and itself imported by
nothing. That is what makes the env-var deletions permanent: nothing is left to re-provision
`POSTGRES_*` or `NEXTAUTH_*`.

`@auth/prisma-adapter` was the one that needed chasing — uninstalling `@prisma/client` left it
behind because the adapter still depended on it. It is the NextAuth Prisma adapter, dead for
the same reason NextAuth was.

The full runbook is `docs/SECRET_ROTATION.md`; `scripts/verify-secrets.js
--production` calls each provider and reports what actually happened.

### Production env: trailing newlines in 13 values (#85)

13 of 33 Production env vars have a **trailing newline in the stored value** — including
`ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY` and
`SERVICE_EMAIL_PROVIDER`. `vercel env pull` escapes these as `\n` in the dotenv file; that
escaping is *not* the bug and reads as one at first glance.

Most are harmless — **verified rather than assumed**: a Supabase client built with the
untrimmed service-role key authenticates and queries fine, and the Stripe key authenticates
once unescaped. Where it bites is **exact string comparison**, which has no library
tolerance: `SERVICE_EMAIL_PROVIDER === 'sendgrid'` is false for `'sendgrid\n'`, so all
three email paths fell through to an SMTP branch with no credentials set. Those reads are
now `.trim()`ed.

**The newlines are now harmless — the code trims where meaning depends on it.** Tested
individually rather than assumed: an untrimmed key works as an `Authorization` header against
both OpenAI and SendGrid (undici normalises header values), an untrimmed URL works in `fetch`
and `new URL()`, and an untrimmed service-role key authenticates to Supabase. The only places
a newline changes semantics are **exact string comparison** and **key material**, and both are
fixed:

- `SERVICE_EMAIL_PROVIDER` / `SERVICE_EMAIL_FROM` — trimmed (an untrimmed `'sendgrid\n'`
  failed `=== 'sendgrid'` and silently selected an unconfigured SMTP branch)
- `SYSTEM_API_KEY` — trimmed on both sides of its `===`; self-consistent before, but an
  external caller sending the real key would have failed
- **`ENCRYPTION_KEY` — trimmed in `lib/encryption.ts`**

**The `ENCRYPTION_KEY` detail is worth understanding.** `getEncryptionKey()` branches on
`length === 64 && /^[0-9a-fA-F]+$/`. Untrimmed the value is 65 chars, fails that test, and
falls through to the **scrypt** branch — so the key in use was derived from
`"<64 hex chars>\n"` rather than being the 32 raw bytes the hex was meant to supply. It
worked because it was self-consistent, and it made the newline part of the key material:
adding the trim later would have silently invalidated every ciphertext.

Adding it was safe **only** because nothing is encrypted — verified 2026-07-29 that both
encrypted columns are empty (`porting_orders.account_pin` and
`user_preferences.email_api_key_encrypted`, 0 rows each). Round-trip verified with the real
production key. **If ciphertext exists, that `.trim()` cannot be removed or altered without a
decrypt/re-encrypt migration.**

Stripping the newlines in Vercel is now cosmetic; it rides along with #29's rotation.

Unresolved: whether Vercel preserves trailing newlines into `process.env` at runtime. Not
provable from outside; the circumstantial evidence is the 8 deliberate
`process.env.STRIPE_SECRET_KEY?.trim()` calls someone added.

### The 22 unset production vars, audited (#84)

43 variables are read across `app/`, `lib/` and `components/`; 21 are set in Production. **None
of the 22 unset ones is currently causing a bug** — but the reasons differ and were not
obvious, so they are recorded rather than left to be re-derived:

| variable(s) | verdict |
|---|---|
| the 11 `STRIPE_PRICE_*` | fall back to hardcoded ids that resolve **only** because the production key is the sandbox's. **Become required the moment a live key is set** — see `STRIPE_LIVE_MIGRATION.md` |
| `RESEND_API_KEY` | dead — the only reference is commented out |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | were read only by `lib/googleCalendar.ts`, which nothing imported. Deleted. The live Calendar path is OAuth with per-user refresh tokens and `GOOGLE_CLIENT_ID` |
| `NEXT_PUBLIC_SITE_URL` | falls back to `https://hyvewyre.com`; the apex domain serves 200 without redirecting, so opt-in links are valid |
| `SERVICE_EMAIL_FROM_NAME`, `TIMEZONE` | sane literal fallbacks |
| the 5 `SMTP_*` | unused while `SERVICE_EMAIL_PROVIDER=sendgrid` — **safe only because of another variable's value** |

That last row was the fragile one. The SMTP branch built a transport pointing at
`smtp.gmail.com` with no credentials, so a wrong provider value produced per-send failures
rather than saying the app was misconfigured. All three email paths now throw with the fix
in the message.

**`scripts/check-required-env.js`** encodes the table above — required / conditional /
optional-with-a-checked-fallback — and exits non-zero on a real gap. It also re-flags the #85
whitespace values. Run it with `--production` before a deploy that touches configuration.
Local `.env.local` currently fails it: `SERVICE_EMAIL_PROVIDER` is not `sendgrid` there and no
SMTP credentials are set, so local email is broken while production's works.

### The Stripe account is a sandbox (#81) — migration runbook exists

`docs/STRIPE_LIVE_MIGRATION.md` is the ordered runbook, and
`scripts/provision-stripe-catalog.js` rebuilds the catalog in a target account from
`lib/pointPacks.ts` (dry run by default; `--apply --yes` to create). It is idempotent, only
ever creates, and names products Growth/Scale rather than the sandbox's Basic/Premium (#82).
Exercised against the sandbox — created 11, re-ran and reused 11 with identical ids, then
archived them, leaving the sandbox at its original 12 products.

**The switch cannot be done from here**: it needs a Stripe dashboard login and handling a live
key. Two ordering constraints that will bite otherwise — all eleven `STRIPE_PRICE_*` vars must
be set in the *same change* as the live key (they are unset today and fall back to sandbox ids
that resolve only because the key is the sandbox's), and every
`users.stripe_customer_id`/`stripe_subscription_id` is a sandbox id that must be cleared or
every renewal hits the "no matching account" path from #80.



`STRIPE_SECRET_KEY` is a **test** key for `acct_1SPlVzFyk0lZUopF`, display name
**"TriDrip sandbox"**, owner email `trippebrowning@gmail.com` — nested under a HyveWyre
organisation in the dashboard. **A Stripe Sandbox has no live mode**, so live prices cannot
be created in it; #63 requires the real account first.

Consequences when that switch happens: all ten hardcoded price-id fallbacks in
`create-checkout/route.ts` plus `STRIPE_PHONE_NUMBER_PRICE_ID` are sandbox-only and need
replacing; `STRIPE_WEBHOOK_SECRET` is per-account-per-endpoint; and every stored
`users.stripe_customer_id` / `stripe_subscription_id` is a sandbox id that won't resolve —
which would send each renewal down the "no matching account" path from #80.

**Product names in Stripe are still `Basic`/`Premium`** (#82) even though code standardised
on Growth/Scale. Those names appear on checkout, receipts and invoices, so a customer
buying Growth sees "HyveWyre Basic Plan". Names *are* mutable, but fix it during the
real-account rebuild rather than twice.

Note the Stripe account email is a third distinct address from `ADMIN_EMAILS`
(`tripped620@gmail.com`) and the Feb-era customer records (`trippbrowning620@gmail.com`).
It is recorded nowhere in the repo — it came from `stripe.accounts.retrieve()`.

**Settings showed prices customers would not be charged** (#77, 2026-07-29). The Credit
Packs table on Settings → Plan hardcoded a *fifth* set of figures built around the
unpublished list price behind the old "30% off" framing — Pro $100/$70, Enterprise
$600/$420. A Scale user read "Pro $70" there and would have been charged $80 at checkout.
That table now renders from `lib/pointPacks.ts`, as does the auto-refill picker, so
Settings, `/points` and the actual charge agree. Five copy sites claiming a flat "30% off"
were replaced with `scaleSavingsRangeLabel()` ("10–25%").

**Savings percentages are floored, never rounded** — a savings claim must not be
overstated. Pro is 15.789% and displays as 15%. `/points` and `scaleSavingsRangeLabel()`
already floored; a `Math.round` in the first pass of the Settings fix made the same pack
read 16% on one page and 15% on another.

**Counting the pricing tables that existed before this pass:** the `/points` page constant,
`subscriptionFeatures.pointPackDiscount`, the auto-buy cron's private table, the Settings
Credit Packs table, and the auto-refill "estimated cost" of `amount × $0.01`. Five sources,
four different prices for 10,000 points ($100 / $95 / $85 / $59.50 depending on where you
looked). All now derive from `lib/pointPacks.ts`. **If you need a price, import it.**

## Tenant isolation — how it actually works, and where it doesn't

Mapped during the 2026-07-28 deep audit. **Two separate mechanisms protect tenant data, and
which one applies depends entirely on which Supabase client a route uses.**

**Request-scoped client** (`createClient()` from `lib/supabase/server`) — carries the user's
JWT, so RLS applies. Ownership is enforced by the database.

**Service-role client** (`createServiceRoleClient()`, or `createClient(url, SERVICE_ROLE_KEY)`)
— **bypasses RLS entirely**. Ownership must be enforced in code, by adding
`.eq('user_id', …)` to every query. 32 routes use this client.

If you move a route from the first to the second — which happened several times on
2026-07-28 while enabling RLS — **every query in it silently loses its ownership check.**
That's the trap.

### The RLS subtlety that decides severity

An `UPDATE … WHERE` must first *find* rows, and row visibility is governed by the **SELECT**
policy. So a restrictive SELECT masks a permissive UPDATE — which is the only reason
`users UPDATE USING true` (see #65) isn't exploitable today. Add a permissive SELECT policy
to that table and the hole opens with no other change. Worth knowing before touching
policies on `users`.

Policies named *"Service role can …"* are a red flag: `service_role` bypasses RLS, so such a
policy only ever grants access to `anon`/`authenticated`. Several exist and are scoped to
`{public}` (#65).

### Verified-clean isolation controls

- `messages/threads/[threadId]` 403s on `thread.user_id !== user.id`
- `send-sms` rejects a body-supplied `userId` without `x-internal-secret`
- `receptionist/respond` requires the internal secret outright
- all 5 crons fail **closed** when `CRON_SECRET` is unset
- `ai/generate-follow-up` filters conversation context by `user_id` — the pattern
  `process-ai-drips` is missing (#64)

---

## Vocabulary inconsistencies that silently break queries

**`messages.direction` accepts four values** — the CHECK constraint permits `in`, `out`,
`inbound`, `outbound`. Different routes write different ones and nothing normalises them, so
`.eq('direction','outbound')` misses everything written as `'out'`. **Nothing ever writes
`'in'`**, so any query filtering on it returns zero rows forever (#66). Check what a writer
actually writes before filtering on direction.

**`leads` has two flow columns** — `flow_id` (uuid, has an FK) and `current_flow_id` (text,
no FK). Both are referenced by code (#68).

**Three internal id columns are `text` pointing at `uuid` keys** — `messages.thread_id`,
`lead_flows.thread_id`, `leads.current_flow_id`. No FK is possible across mismatched types,
and joins need an explicit `::text` cast or they silently return nothing (#68).

---

## Database writes — the failure mode that keeps recurring

**supabase-js returns `{ error }`; it does not throw.** An unchecked write fails
completely silently, and a `try/catch` around it catches nothing. This single fact is
behind more shipped bugs here than anything else: the DNC opt-out failure (#34, months
of "success" logs while writing nothing), `user_telnyx_numbers.capabilities`, and the
entire 2026-07-28 audit cluster (#51–#55).

**Fixed 2026-07-28 (commit `db54fa7`)** — five tables where the code wrote columns that
didn't exist, so Postgres rejected the statement and nobody noticed:

| Table | What was wrong | Resolution |
|---|---|---|
| `scheduled_messages` | `source`, `campaign_id` missing → **scheduling never worked**, 0 rows ever | columns added (`source` has a real reader) |
| `messages` | `credits_cost`/`from_number`/`to_number`/`telnyx_message_id`/`sender`/`segments` | code corrected to `points_cost`/`from_phone`/`to_phone`/`message_sid`; `sender`+`segments` dropped |
| `flow_completion_log` | `flow_id`, `completion_type` missing → 0 rows ever | columns added; `campaign_id` NOT NULL also dropped |
| `user_preferences` | `calendar_booking_url`, `calendar_type` missing | columns added (both documented in CLAUDE.md) |
| `points_transactions` | `stripe_payment_intent`, `balance_after` | code uses `stripe_session_id` (gains the idempotency index); `balance_after` dropped |

**The lesson worth keeping — diffing column lists is not enough.** Comparing code against
`information_schema.columns` found the missing columns, but *two further bugs* only
appeared when the writes were actually executed against the live database:

- `messages.content` is **NOT NULL with no default**, and the four broken inserts wrote
  only `body`. Renaming the columns would have left them all still failing on `23502`.
  The paths that already worked set **both** `content` and `body` to the same text.
- `flow_completion_log.campaign_id` was **NOT NULL**, so a flow completion outside a
  campaign failed even after the new columns existed.

So: when fixing a write, run it end-to-end against the real database and delete the test
row, rather than trusting that the column names now line up. Both of those would have
shipped otherwise.

`content` vs `body` on `messages` is a live trap — the table has both, `content` is the
NOT NULL one, and most code writes `body`. Always set both.

---

**`createNotification` was itself an instance of this** (#78, 2026-07-29). It wrapped its
insert in `try/catch` — which, per the rule above, caught nothing, because supabase-js
resolves with `{ error }` rather than throwing. Every failed notification was reported as
success and vanished. It now checks `error` and returns a boolean.

**Operator alerts: `notifyAdmins(type, title, body, data)`** in the same file. Resolves
`ADMIN_EMAILS` to user rows and writes a notification to each. Use it for anything a
customer experiences but only an operator can fix. All five failure branches of the paid
number-purchase path in `app/api/stripe/webhook/route.ts` call it — previously each was
`console.error` + `break`, so on Vercel a customer could pay, receive nothing, and leave no
trace but a log line nobody reads.

The alert of last resort must not fail quietly, so when it cannot deliver — `ADMIN_EMAILS`
unset, no matching user row, every insert failing — it logs `🚨 ADMIN ALERT UNDELIVERABLE`
**with the full alert text inline**, so the log line still carries the whole message. An
alert that silently fails to send is worse than none: it creates the impression something
is watching when nothing is. Verified for all three undeliverable cases.

The worst of the five branches is `route.ts` "ordered but not saved" — Telnyx accepted the
order and the customer was charged, but the `user_telnyx_numbers` write failed, leaving a
real number live and billing with no owner recorded. That one needs a manual row, not a
refund, and its alert says so.

**The plan and point-pack paths alert too** (#80, 2026-07-29) — plan purchase, pack
purchase and monthly renewal, i.e. the main revenue flow, not just the number path.

**The subtle one:** both purchase paths use a duplicate `points_transactions` insert as
their idempotency check, and both previously treated *any* insert error as "Stripe
redelivered this" and skipped granting credits. Only `23505` (unique violation) actually
means redelivery. Any other error — an FK violation, a constraint change, a column type
mismatch — meant the customer was charged and the credit grant was silently skipped, while
the log said "already processed". These now branch on `insertError.code === '23505'`:
redelivery stays quiet, anything else alerts. Verified against the live DB that a repeat
insert returns `23505` and an FK violation returns `23503`.

Two of the alerts distinguish "charged, nothing recorded" from "charged, ledger written but
balance not updated". The second is worse to diagnose because `points_transactions` claims
the points were granted while the balance never moved, so its alert names the exact amount
to add by hand.

### Auto-refill: a `throw` that reported the opposite of what happened (#80, 2026-07-29)

`cron/auto-buy` charges saved cards off-session, once an hour. When the charge succeeded but
the credit grant failed, the code did `throw new Error('Failed to update credits: …')` — and
the enclosing `catch` is the *Stripe* catch, so the operator was told **"Payment failed"**
for a card that had just been charged successfully. The customer paid and got nothing, and
the one record of it pointed the wrong way. It now alerts with the PaymentIntent id and
`continue`s to the next user instead of aborting.

The decline branch had the pattern this file keeps coming back to: `auto_topup: false` was
written fire-and-forget. Unchecked, so if the update failed the cron **retried the declined
card every hour**; unannounced, so when it succeeded the customer's auto-refill switched
itself off and nothing told them — they discovered it by hitting zero credits and losing the
ability to send. Both branches are handled now, and the customer is notified, because only
they can fix a card.

### Throttled alerting for anything that runs on a schedule

`lib/alerting.ts` → `alertAdminsThrottled({ key, title, body, data, windowMinutes })`.

`notifyAdmins()` is right for a one-off. It is **wrong for the crons**, which run every 5–10
minutes: a per-occurrence alert on a persistent fault is ~288 notifications a day, and a
channel that fires constantly gets muted, which costs more than having no channel. This
alerts on the first occurrence in a window (default 60 min) and logs the rest with a 🔁
marker.

Dedupe state lives in the notification rows themselves — `data.alert_key`, queried with
`.filter('data->>alert_key', 'eq', key)` — **not** in module scope. Each cron invocation is a
separate serverless instance, so an in-memory cache would never see the previous run. If the
dedupe lookup itself fails it sends anyway; a duplicate alert beats losing the only signal.

Wired to whole-run and fetch-work failures in all five crons, where the outcome is "nothing
was processed and nobody knows":

> **`process-scheduled` returns `ok: true` when it processes nothing.** If
> `get_messages_ready_to_send()` errors, `processScheduledMessages()` returns
> `{ processed: 0, error }` and the route still responds **200 `ok: true`**. An uptime check
> sees green while not one scheduled message goes out. This is why the alert is on the RPC
> error and not on the HTTP status.

Two sites in the **SMS webhook**, both losses rather than errors:
- **an inbound reply that fails to save is unrecoverable** — Telnyx has already accepted the
  webhook and will not redeliver, so the message is gone and the owner just sees a lead who
  apparently never replied.
- **a failed `add_to_dnc` means someone texted STOP and is still sendable.** Keyed per phone
  number (`dnc_write_failed:{user}:{phone}`, 24h window) rather than per route: the remedy is
  adding *that* number by hand, so each affected person needs their own alert, while webhook
  redeliveries of the same STOP still collapse.

Left as plain logs, deliberately: delivery-status update failures and the per-message
diagnostics where the surrounding code recovers correctly. The filter that decides is *did a
customer pay, or lose a message, and would nobody find out?*

Verified 9/9 against the live database (sends once, suppresses inside the window, resends
after it, keys independent), then end-to-end through a real route — a forced throw in
`process-drips` run twice produced exactly one notification row.

### Email escalation — 15 of 41 alerts (#79, 2026-07-29)

`notifyAdmins(type, title, body, data, { escalate: true })`, and the same flag on
`alertAdminsThrottled`. Sending lives in **`lib/sendEmail.ts`** — moved out of
`app/api/notifications/email-alert/route.ts`, which is what made escalation possible at all:
the logic was only reachable from an authenticated HTTP request, so a webhook could not use it
without fetching the app from itself. The route now calls the same function.

**The rule for escalating: delay itself compounds the harm.** A card charged with nothing
delivered, a number live and billing with no owner recorded, a STOP that failed to record so
every further send is a fresh violation, a deletion that left the login working. Everything
else — cron failures, a ledger row that didn't write, an exhausted number pool, a rate ceiling
— stays in-app on purpose. A channel that fires for everything gets muted, and then it is
worse than not having it.

Escalation email **ignores `user_preferences`**. The email-alert route honours per-type
toggles, right for "you have a new message" and wrong here: an operator switching off
new-message emails must not silently disable the one that says a customer paid and got nothing.
It sends to the `ADMIN_EMAILS` addresses directly, not to matched `users` rows, so it still
arrives when an admin address has no account.

**The two channels are independent, not a fallback chain.** The email is sent and awaited
before the notification insert, so each still happens if the other fails. With email
unconfigured the in-app notification is still written and the log carries
`ADMIN EMAIL ESCALATION UNAVAILABLE` plus the full alert text — silence there would leave the
impression that escalation is working.

`SERVICE_EMAIL_PROVIDER` is compared exactly and **production's value has a trailing newline**,
so the `.trim()` in `createTransporter()` is load-bearing: without it `'sendgrid\n'` falls
through to the SMTP branch, which has no credentials in production, and email dies silently
(#85).

### Email runs on PrivateEmail SMTP, not SendGrid (#101, 2026-07-30)

**Current state:** `SERVICE_EMAIL_PROVIDER=smtp` against `mail.privateemail.com:465` (implicit
SSL, so `SMTP_SECURE=true`), authenticating as `support@hyvewyre.com`, which is also
`SERVICE_EMAIL_FROM` — PrivateEmail only sends from the mailbox you authenticate as, so those
two must match. Verified in production by an actual send: `/api/email/service` returned
`{ok:true, messageId:<…@hyvewyre.com>}`.

`SMTP_PASSWORD` is stored **sensitive** in Vercel, so `vercel env pull` returns the literal
string `[SENSITIVE]` and it cannot be verified from a developer machine. `verify-secrets.js`
detects that placeholder and says so rather than trying to authenticate with it and reporting
a credential that is probably fine as broken.

**Why SendGrid was dropped:** the account (`hyvewyre@gmail.com`) was on the **free** plan with
`total: 0, remain: 0, is_hard_limit: true` and reset dates frozen at 2026-05-01/02 — the
allowance had lapsed months earlier, so it was not a quota to top up. Reputation was 100 and
the API key was valid; nothing was wrong with the credential. Kept below because the way that
presented cost real time.

**SendGrid is fully removed** — `SENDGRID_API_KEY` deleted from Vercel 2026-07-30, and a real
send verified afterwards. Five copies of the mail transporter existed; all five now go through
`lib/sendEmail.ts` (`email-alert`, `email/service`, `sendSmsAlert`, plus the two named in #79).
**`app/api/email/send` is deliberately separate** — it builds a transport from per-user
encrypted config in the database, not from environment variables.

**Account-creation email does not use any of this.** `supabase.auth.signUp()` and
`resetPasswordForEmail()` are sent by **Supabase Auth**, with whatever sender is configured in
the Supabase dashboard — not `lib/sendEmail.ts` and not the `SMTP_*` variables. Changing the
app's sender does nothing to signup mail; that needs Supabase → Authentication → SMTP Settings.
See #103, which also covers `donotreply@` and the fact that `welcomeEmail` exists but has no
caller, so a new user receives only Supabase's confirmation and nothing else.

#### The two faults that made a working key look revoked

Found by actually sending one.

**1. The key was passed to SMTP AUTH untrimmed.** Production's `SENDGRID_API_KEY` carries a
trailing newline (#85). **HTTP strips trailing whitespace from a header; SMTP AUTH does not** —
it base64-encodes the password verbatim, so the newline goes over the wire and SendGrid answers
`535 Authentication failed: the provided authorization grant is invalid, expired, or revoked`.
That reads as a dead key and is not one. `createTransporter()` now trims every credential.

**2. With the key trimmed, AUTH succeeds and the account refuses:** `451 Authentication failed:
Maximum credits exceeded`. The SendGrid account is out of sending credits. **Not fixable in
code** — this is why the provider was changed rather than repaired.

**Not broken:** password reset and signup confirmation go through **Supabase Auth**, not
SendGrid. That is why this went unnoticed — the email path anyone would miss fastest is the one
that does not use this key.

#### Two ways this hid, both worth remembering

- **`vercel env pull` writes a trailing newline as the literal two-character escape `\n`
  inside quotes.** `tr -d '\n'` deletes real newlines, not that escape, so a shell pipeline
  that looks like it sanitises the value actually *appends two junk characters*. That produced
  a 401 and a wrongly-filed "the key is revoked" issue. Decode the way the runtime does, or
  check the length: 69 became 71.
- **`scripts/verify-secrets.js` reported green**, twice over: it trimmed the key before testing
  (validating a value the app never uses — the whole fault was in the untrimmed form), and it
  called `GET /v3/scopes`, which strips the whitespace anyway and says nothing about whether
  the account can send. It now does a real SMTP handshake with `transporter.verify()` on the
  **raw** value, and reports the trimmed failure separately when it differs.

**Rule:** validate a credential the way the code consuming it will, not the way that is
convenient. An HTTP probe does not prove an SMTP credential.

## Crons: three of five had never run (#97, 2026-07-29)

**Vercel Cron invokes the scheduled path with an HTTP `GET`.** Per the docs: *"To trigger a
cron job, Vercel makes an HTTP GET request to your project's production deployment URL."*
Requests also carry the user agent `vercel-cron/1.0` and an `x-vercel-cron-schedule` header.

`process-drips`, `process-ai-drips` and `send-appointment-reminders` exported the real work
as `POST` and a **metadata-only stub** as `GET`. So every scheduled run hit the stub, got
`200 {ok: true}` back, and did nothing — Vercel records a successful invocation and nothing
reports a problem. Drip campaigns, AI drips and appointment reminders had **never fired on a
schedule**.

The tell, against production: an unauthenticated `GET` returned **401** on `process-scheduled`
and `auto-buy`, and **200** on the other three. The two that worked are auth-gated on GET
*because GET is where their work lives*.

No damage had occurred only because nothing was enrolled — `drip_campaign_enrollments` and
`calendar_events` were both empty. The corroborating trace was `ai_drips`: 4 rows created
2026-01-20 with `next_send_at` of 01-21/22, all `stopped`, all with `messages_sent = 0`.

Now `export const GET = handleCron; export const POST = handleCron;` on all three.

**Rules this leaves behind:**
- A cron route must do its work on **GET**. A POST-only cron is dead on arrival, and it fails
  in the direction that looks healthy.
- `vercel.json` is the only scheduler — there is no external cron service. Check there before
  assuming a route is triggered.
- All five routes are `ƒ` (dynamic) in the build output and declare
  `export const dynamic = "force-dynamic"` — with **double quotes**, which a single-quote grep
  misses. A cron route that became static would serve Vercel a cached response and
  reintroduce this bug in a subtler form.
- The five disagree on which auth header they accept (#96): only `process-scheduled` reads
  `x-cron-secret`; the rest are `Authorization: Bearer` only. Fine for Vercel Cron, a trap the
  moment the trigger changes.

### How the crons are actually scheduled (#102, 2026-07-30)

**Two schedulers, on purpose, and only for `process-scheduled`.**

| | schedule | covers |
|---|---|---|
| Vercel Cron (`vercel.json`) | `*/5` → :00, :05, :10 … | all five cron routes — the primary |
| GitHub Actions (`.github/workflows/scheduled-messages-cron.yml`) | `2-59/5` → :02, :07, :12 … | `process-scheduled` only — a backstop |

The offset is deliberate: no overlapping minutes. Two workers on the same boundary race for the
same message, and while the row claim handles that correctly now, not colliding is cheaper than
relying on the lock. The workflow also declares a `concurrency` group so a slow run makes the
next wait rather than stacking another caller.

**Why a second scheduler exists at all:** Vercel's scheduler has already failed silently once.
In #97 three of five routes had their handler on `POST` while Vercel only ever sends `GET`, so
they answered 200 and did nothing for months. A trigger that does not depend on Vercel is the
thing that would have kept scheduled messages flowing through that. **Do not delete it as a
duplicate.**

**It had never run.** From the day it was written until 2026-07-30, everything below `name:` was
indented two spaces — invalid at the root of a workflow — and the curl line continuation was
mangled. Every run failed in 0 seconds, attributed to a push, and the schedule never fired. So
for the whole of that period there was exactly one scheduler, not two, and the "backup" was
decorative. A workflow that fails to parse still *appears* in the Actions tab, which is what
made it look alive.

#### `CRON_SECRET` lives in two places and they drift

Vercel Production **and** GitHub Actions repository secrets. They were already out of sync — the
GitHub copy had not been touched since 2025-11-06 while Vercel's had been rotated, so the first
successful parse of the workflow produced a `401`. Rotating in one place silently stops the
backstop being a backstop.

Re-sync without handling the value by hand — pasting is how a trailing newline gets in, which is
exactly what #101 cost:

```bash
vercel env pull /tmp/.cron.env --environment=production --yes >/dev/null && \
sed -n 's/^CRON_SECRET="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /tmp/.cron.env | tr -d '\n' | \
gh secret set CRON_SECRET --repo tripptrap/trippdrip-v8-sprint1 && rm -f /tmp/.cron.env
```

Confirm it landed with `gh api /repos/<repo>/actions/secrets` — the `updated_at` must be today.
`gh secret list` shows the same field; if the date has not moved, the save did not happen.

Verified end to end 2026-07-30: manual dispatch returns `HTTP 200`,
`{"ok":true,"messagesProcessed":{"processed":0,"failed":0}}`.

### Cron auth is one helper now (#96, 2026-07-29)

`lib/cronAuth.ts` — `requireCronAuth(req)` for the five cron routes, `isInternalCaller(req)`
for service-to-service calls, `secureCompare(a, b)` under both.

There were five hand-rolled copies and they had drifted: only `process-scheduled` read
`x-cron-secret`; the rest were `Authorization: Bearer` only. Both forms now work everywhere.
`requireCronAuth` returns `null` when authorised or the response to return as-is.

**`CRON_SECRET` is also the internal service-to-service secret**, sent as `x-internal-secret`
(cron → `telnyx/send-sms`, sms-webhook → `receptionist/respond`). Those two receivers compared
it with `===` while the crons went to lengths to compare the identical value in constant time.
Both use `secureCompare` now. The `send-sms` one matters most: passing that gate is what lets
a caller supply an arbitrary `userId` in the body and send as that user.

**The fail-open to remember:** `secureCompare('', '')` returns **true**. An unset `CRON_SECRET`
must be caught *before* the comparison, not by it — `requireCronAuth` returns 500 in that case
and never authorises. Verified 19/19, including that path.

Deliberately lenient and unchanged: `authHeader.replace('Bearer ', '')` is a no-op on a bare
value, so `Authorization: <secret>` without the prefix is also accepted. Knowing the secret is
the boundary, so this costs nothing and tolerates odd clients.

### `SECURITY DEFINER RETURNS SETOF <table>` returns zero rows over PostgREST (#61, 2026-07-31)

**Do not write a Postgres function that returns `SETOF <table>` and call it with `.rpc()`.** It
can return an empty array with `error: null` to the route while returning the correct rows to
every other caller — a silent, total failure with nothing to catch.

This is *not* the #97 problem (handler on the wrong verb). These crons ran, authenticated, and
returned `ok: true`. They fetched nothing.

Measured inside a single production request, with one `scheduled_messages` row 54 minutes
overdue:

```
whoami:                    {"current_user":"service_role","pending_visible":2}
get_messages_ready_to_send:{"count":0,"error":null}
```

and after switching that one call to a direct query, in one request:

```
messages direct vs rpc:  {"direct":1,"directErr":null,"rpc":0,"rpcErr":null}
```

The same function, at the same instant, as the same role: **1 row to the direct query, 0 to the
RPC.** Ruled out empirically, in this order — each of these was a live theory that the evidence
killed:

- **Not auth.** `current_user` is `service_role`, from the route's own client.
- **Not RLS.** That same client reads `scheduled_messages` fine in the same request.
- **Not timing.** The row was overdue by 54 minutes; `scheduled_for <= now()` was true in SQL.
- **Not the client library.** `@supabase/supabase-js` with the same key, run locally against the
  same project, returns 1 row from the same RPC.
- **Not a stale PostgREST schema cache.** `NOTIFY pgrst, 'reload schema'` changed nothing.
- **Not a wrong project or key.** Prod and local `NEXT_PUBLIC_SUPABASE_URL` are the same ref
  (`ljibsszhcvhwnoegweat`); the JWT's `ref`/`role` match.
- **Not a chained filter.** The call site is a bare `.rpc(name)` with no `.eq()`/`.limit()`.

What remains is the function itself as PostgREST serves it to that client. The root cause below
that is still unidentified, and the fix does not depend on knowing it.

**The blast radius was exactly three functions** — the entire schema contained only three
`SETOF`-returning functions, and all three were cron "what's due" queries:

| function | route | now |
|---|---|---|
| `get_messages_ready_to_send` | `cron/process-scheduled` | inlined |
| `get_campaigns_ready_for_batch` | `cron/process-scheduled` | inlined |
| `get_ai_drips_ready_to_send` | `cron/process-ai-drips` | inlined |

`get_drip_enrollments_ready_to_send` is **`RETURNS TABLE(...)`, not `SETOF`** — it is the one
that was never affected, and it is the shape to copy if a helper function is wanted again.

All three predicates are now inlined as plain PostgREST queries. Two notes on the translation:

- They compare against **the app's clock**, not the database's `now()`. Both track NTP and the
  cron runs every 5 minutes, so sub-second skew cannot change which rows are due.
- `ai_drips` needed `messages_sent < max_messages`, a **column-to-column** comparison PostgREST
  cannot express. It is applied in JS after a `.limit(200)` read, with the original `LIMIT 50`
  re-applied *after* filtering — so a batch of exhausted drips cannot starve live ones.

**Verified in production 2026-07-31**: the cron found the due message on the first run after the
change (`📤 1 scheduled message(s) due`) and deferred it on recipient-local quiet hours
(`03:02 America/New_York`, window 08:00–20:00) — the first time this cron has ever reached that
code path. `processed: 0` with a deferral is correct, not a failure.

The temporary `whoami_probe()` used to isolate this has been dropped from the database.

## Rate limiting (#58, 2026-07-29)

`lib/rateLimit.ts` → `limitByIp(req, scope, limit, windowSeconds)`; returns `null` when
allowed or the 429 to return as-is. Backed by the `check_rate_limit(key, limit, window)` RPC
and the `rate_limits` table (service-role only, RLS on with no policies).

**Do not use an in-memory Map for this.** `app/api/ai/compose` has one, and it is per
serverless instance: on Vercel a caller spread across N warm instances gets N times the limit,
and every cold start resets the count. A counter is only a limit if every instance shares it.

The RPC does the count and the decision in one `INSERT ... ON CONFLICT DO UPDATE`, which takes
a row lock — a SELECT-then-UPDATE in application code would let two concurrent requests read
the same stale count and slip past together. Rows are reused per key and pruned
opportunistically, so the table grows with distinct keys, not request volume.

**`clock_timestamp()`, not `now()`.** `now()` is the *transaction* timestamp and is frozen for
the whole transaction, so multiple calls inside one transaction share a window that can never
expire — a `pg_sleep` between them changes nothing. Each PostgREST call is its own transaction
so `now()` would usually behave, which is what makes it a trap: it also cannot be tested in a
single statement. This was caught by a test that failed, not by reading the code.

**Client IP on Vercel is not spoofable.** Per Vercel's request-headers docs, it *overwrites*
`X-Forwarded-For` and does not forward external IPs, explicitly "to prevent IP spoofing" — so
a caller sending its own header does not get a fresh bucket. `clientIp()` prefers `req.ip`,
then `x-vercel-forwarded-for` (same value, but survives a proxy running on top of Vercel,
which can overwrite `x-forwarded-for`), then `x-forwarded-for`, then `x-real-ip`. A request
with no determinable IP shares one bucket rather than getting a free pass.

**Fails open, loudly.** If the limiter breaks, locking real users out of a login-support
endpoint over an infrastructure fault is worse than briefly losing the throttle.

### Where it is applied

| endpoint | limit | why |
|---|---|---|
| `POST /api/auth/account-status` | 10 / 60s per IP | unauthenticated, service-role read of `users` by arbitrary email; a suspended/banned account is distinguishable from an active one, so a list can be probed for restricted addresses (#58) |

The check runs **before** `req.json()` and before the `users` lookup, so a throttled caller
costs one counter upsert rather than a query — the free unauthenticated read was half of what
#58 was about.

Degradation is graceful: on 429 the login page reads `statusData.status`, finds nothing, and
falls through to its normal "Invalid login credentials" toast. Verified in the browser.

| `POST /api/opt-in/submit` | 5 / 60s per IP (blocks) + 100/hr per slug (**alerts only**) | public consent page; each call writes a consent audit row and creates a lead on the targeted business (#99) |
| `POST /api/contact-form` | 5 / 60s per IP (blocks) + 100/hr total (**alerts only**) | same exposure, same table (#99) |

### Why the per-page ceilings alert instead of blocking

Capping one business's opt-in page would hand anyone a way to deny it their signups — burn the
quota from a botnet and real customers are turned away. **A lost opt-in is worse than a junk
one:** junk can be filtered by pattern afterwards, a missed customer and their consent record
cannot be recovered. Same for the contact form, where a global cap would let one caller take
the form down for everyone and the limit would become the outage.

So the per-IP limit does the blocking, where a false positive costs one person one minute, and
`observeRate()` makes a distributed flood *visible* without absorbing it silently.

The per-slug counter runs **after** the slug resolves to a real business. Counting an
unvalidated slug would let a caller grow `rate_limits` without bound by rotating slugs that
don't exist.

### The survey that missed one

The #58 pass grepped for `SUPABASE_SERVICE_ROLE_KEY` and concluded there were two public
service-role endpoints. `/api/contact-form` reaches the same privileges via
`createServiceRoleClient()` and did not match. **Grep for both spellings** — the real list is
three, all now limited.

## Phone normalisation — one rule, in two languages (#100, 2026-07-29)

`lib/phone.ts` → `normalizePhone(input): string | null`. **It must agree with the SQL
`normalize_phone()`**, because that function is what `check_dnc()` and `find_lead_by_phone()`
compare against: a number normalised differently in TS is a number that silently escapes
opt-out enforcement or fails to match its own lead. The TS version is transcribed from the SQL
one, not reinvented.

The rule, in both:

```
strip non-digits
11 digits starting with 1  ->  +<digits>
exactly 10 digits          ->  +1<digits>    (assume US)
10 or more digits          ->  +<digits>
shorter                    ->  SQL returns the input unchanged; TS returns null
```

That last line is the one deliberate divergence — SQL hands back something non-E.164 that
looks normalised, TS makes the caller decide. Every caller validates length first, so it does
not arise. **Verified by differential test against the live database over 19 inputs** (bare
10-digit, punctuated, `+1`-prefixed, 11-digit, UK, CN, 15-digit, leading-zero, junk): every
normalisable input agrees exactly.

### What was broken

`/api/opt-in/submit` did `phone.startsWith('+') ? phone : '+' + digits`, so a 10-digit US
number — **what the branded form's own placeholder asks for** — became `+5550001234`, no
country code. `normalize_phone()` rescued DNC and lead matching, which is why nothing looked
wrong. It did not rescue sending: `lib/telnyx.ts` passes `to` straight to the API and
`send-sms` doesn't normalise either, so the send fails. Consent collected through the
compliant path, then no way to message the person.

`/api/contact-form` normalised nothing at all — one person could occupy two rows as
`5551234567` and `+15551234567`.

`ingest` and `upload-document` each had their own correct copy; both now use the shared one.

### The read side matters too

The opt-in duplicate check was `.eq('phone', e164)`. An exact comparison misses a lead whose
number was imported in another format and creates a second record for the same person — the
same bug #95 fixed on the inbound path. It now uses the `find_lead_by_phone` RPC. Verified by
planting a lead as `5550009999` (as a bad CSV import leaves it) and then opting in from that
number: no duplicate.

**Rule this leaves behind:** never compare `leads.phone` with `=` when the input came from
outside. Use `find_lead_by_phone`, and normalise with `normalizePhone()` before storing.

## Shared number pool: reuse, quarantine, history (#38, 2026-07-29)

**Carrier reputation attaches to the number, not the tenant.** A released pool number used to
have `is_assigned` cleared and go straight back out, carrying the previous business's spam
complaints, blocks and filtering to the next one — who experiences it as "HyveWyre's SMS
doesn't work". With three numbers in the pool, recycling is the normal case.

`lib/numberPool.ts` holds the policy; `release_pool_number` and `record_pool_assignment` are
the RPCs.

### There are three release paths, not two

| path | reason recorded |
|---|---|
| `telnyx/release-number` | `user_released` |
| `user/delete-account` | `account_deleted` |
| `telnyx/numbers` | `unverified_auto_release` — auto-releases a toll-free number that lost TFV |

That third one is easy to miss and is the one you least want recycled silently. All three call
`releasePoolNumber()`. **The only remaining direct `is_assigned: false` write is the claim
rollback in `number-pool/claim`, and that is correct** — a claim that failed never happened, so
it must not start a cooldown or write history.

### The cooldown yields; spam history does not

`QUARANTINE_DAYS = 30`, but it is **not a hard block**. Three numbers and a strict cooldown
could leave nothing to give a new customer, and refusing to onboard is worse than reusing a
clean number early. `evaluateClaim()` prefers rested numbers, falls back to a quarantined one
only when there is genuinely nothing else, and alerts (`pool_exhausted`). `number-pool/available`
mirrors this — resting numbers are offered only when no rested one exists — so the UI never
advertises a number the claim path would then refuse.

`SPAM_RATIO_LIMIT = 0.05` **is** absolute and is checked first: over it, the number is withheld
regardless of cooldown and admins are told to retire rather than recycle it. Reputation does
not age out in thirty days.

**Telnyx unreachable is "unknown", not "bad"** — `getNumberHealth()` returns `ok: false` and
the claim is allowed. Blocking onboarding on an API hiccup would be a self-inflicted outage.

### getNumberHealth — checked against the live API

`GET /v2/phone_numbers/{id}/messaging` returns the metrics **nested under `data.health`**, not
at the top level: `message_count`, `spam_ratio`, `success_ratio`, `inbound_outbound_ratio`. It
is keyed by Telnyx's internal id, so reading it for a phone number is two calls. An unknown
number yields `ok: false`, not zeros — zeros are a real reading and mean a clean, unused number.

### number_pool_assignments

One row per tenancy; `released_at IS NULL` means currently held. `health_at_release` is captured
at the moment of release because the metrics move on with the number afterwards.

**`user_id` has no foreign key on purpose.** Account deletion is one of the release paths, so a
CASCADE would delete exactly the rows worth keeping — the same retention reasoning as #87/#93.

### Two gotchas from doing this work

- **Moving a write into an RPC can silently drop an ownership check.** The route filtered on
  `.eq('assigned_to_user_id', user.id)` because `phoneNumber` arrives in the request body; the
  first version of the RPC matched on phone number alone, which would have let a caller release
  someone else's number. The RPC filters on `p_user_id` now. Test that as an actual attack, not
  by reading it.
- **`supabase db query` returns `{"_tag":"Error", ...}` with no `rows` key when a statement
  fails.** A helper that prints only `.rows` shows an empty result and looks like "the update
  matched nothing", sending you hunting for RLS or shell quoting. The real cause was a `23503`
  FK violation from a made-up UUID: `number_pool.assigned_to_user_id` references `users`. Always
  surface the error branch.

## AI flow completion — confirm, then book

Built 2026-07-29 (#70). Before this, completion was detected and passed to the AI, and
nothing acted on it — no appointment, no tag, no record.

**The cycle:** every flow field collected → `markAwaitingConfirmation()` sets
`leads.conversation_state.awaitingAppointmentConfirmation` → the AI asks the lead to
confirm → an affirmative reply runs `confirmAndBookAppointment()`, which creates the
`calendar_events` row, sets `appointment_scheduled`/`appointment_at`, adds **"appointment
set"** as `primary_tag`, writes `flow_completion_log`, and fires the appointment SMS alert.

Both halves live in `lib/flows/completeFlow.ts`; the webhook calls them from the flow block.

**`isAffirmative()` is deliberately narrow and whole-message only.** A false positive books
an appointment the lead never agreed to, which is worse than asking again — so "yes but can
we do Tuesday" and "maybe" fall through to the AI as reschedule/clarification. Widen it only
with that trade in mind.

**Two schema constraints shaped this and are worth remembering:**

- `calendar_events.google_event_id` **was** NOT NULL, meaning an appointment could only
  exist after a successful Google insert — impossible for the 6 of 7 users without Google
  connected. Now nullable: **NULL means booked in HyveWyre but not synced to Google.**
- `flow_completion_log.campaign_id` is NOT NULL, so a completion is logged **only when the
  lead has a campaign.** Flow completions outside a campaign are currently not recorded.

**`YES` is both an opt-in keyword and a confirmation.** Already handled — the webhook only
treats it as a re-subscribe when the number is actually on the DNC list, so it reaches the
flow normally. Don't "fix" this by reordering the keyword checks.

**Not wired:** Google Calendar sync for connected users (the local appointment is created
either way; `/api/calendar/create-event` does the sync), and parsing a specific proposed
time out of the conversation — an unspecified booking defaults to the next weekday at 10:00.

---

## Drips — materialised, not a cursor

**Changed 2026-07-28.** A drip used to store only a cursor
(`drip_campaign_enrollments.current_step` + `next_send_at`), with `process-drips`
computing the next send after each one went out. Only ever one future send existed, so
the scheduled view couldn't show a lead's queue and no individual step could be edited.

**Now:** enrollment writes every step as a real `scheduled_messages` row
(`source: 'drip'`, `drip_enrollment_id`, `drip_step_id`), with cumulative
`scheduled_for` — each step's delay is relative to the previous message, matching the
old cursor arithmetic. Delivery runs through `cron/process-scheduled`, which is where
quiet hours, DNC, credits, the claim-before-send guard and thread attachment live.

**How double-sending is prevented, with no change to the drip cron:**
`get_drip_enrollments_ready_to_send()` requires `next_send_at IS NOT NULL`, so
`materializeDripSteps()` clears it and the enrollment drops out of that cron. If
materialisation fails, `next_send_at` is left intact and the drip cron still delivers —
degraded to the old behaviour rather than a dropped sequence. If the handoff itself
fails, the rows are rolled back rather than risk both systems sending.

**Cancellation is now explicit.** Pausing an enrollment no longer stops anything — the
queued rows stand on their own. `cancelPendingDripMessages()` is called from the SMS
webhook on **reply** and on **opt-out**. It only touches `pending` rows that have a
`drip_enrollment_id`, so a manually scheduled message isn't binned by a lead replying.
**Any new "stop this drip" path must call it**, or the queue keeps sending.

**Trade-off:** step content is personalised at enrollment, not at send, so a later name
change isn't picked up. That's the cost of the message existing — and being editable —
in advance.

Tag-triggered enrollment (`trigger_type: 'tag_added'` + `trigger_config.tag`, fired from
`app/api/leads/[id]/route.ts`) and `delay_days`/`delay_hours` both predate this and were
already working; materialisation is what made them visible. The `/scheduled` page's
source badge and filter also already existed — they were dead only because the `source`
column didn't exist (#54) and drips never wrote rows.

---

## Outbound SMS — the gates every send must pass

As of 2026-07-28 there are **two shared helpers**, and new send paths should use them
rather than reimplementing the checks. Three separate bugs came from each path having
its own copy (or none): #34, #40, #50.

**`lib/smsGuard.ts` → `checkSmsAllowed(supabase, userId, phone, opts)`** — the single gate
for lead-facing sends. Checks, in order: quiet hours (optional), the `check_dnc` RPC, then
`leads.sms_opt_in` as defense-in-depth.

- **Fails closed** on a DNC lookup error. Sending to a possibly-opted-out number is a
  legal problem; not sending during a transient DB error is an availability problem.
- Returns `retryable: true` for quiet-hours blocks only. **Callers must honour this** — a
  deferred message stays pending, a DNC/opt-out block cancels. The bulk path used to
  cancel outright, permanently dropping a message for being sent at the wrong hour.
- Writes blocked attempts to `dnc_history` for audit.
- Pass `enforceQuietHours: true` and `recipientState: lead.state` from automated paths.
  Human-initiated single sends (`/api/sms/send`) are deliberately exempt from quiet hours.

**`lib/quietHours.ts` → `checkQuietHours(settings, recipientState, now?)`** — reads the
user's configured `quiet_hours_enabled/start/end/timezone` (defaults 08:00–20:00,
America/New_York).

**The important part: it gates on the *recipient's* local time**, resolved from
`leads.state`, falling back to the sender's timezone only when unknown. TCPA keys on the
called party's local time. Every pre-2026-07-28 implementation was sender-relative, so a
California lead texted at 9am Eastern received at 6am Pacific from a path that believed
it was compliant. `leads.state` is free text and contains junk (`"NOW"`), so unrecognised
values fall back rather than guess.

**States spanning multiple zones are evaluated against *all* of them, and blocked if it is
quiet hours in any one** (#74). The first version of this mapped each split state to its
westernmost zone, on the reasoning that west "only errs conservative". That is true at the
morning edge and **false at the evening one** — west makes the computed local time
earlier, so at the end of the day it thinks there is still room to send. Measured against
the live 08:00–20:00 window: at 20:45 Eastern a Florida lead computed as 19:45 Central and
**sent**, while most of Florida is Eastern and actually at 20:45. Texas had the same shape
(mapped to Mountain, overwhelmingly Central). FL+TX are 86 of the leads on this account.
If you touch `STATE_TIMEZONES`, keep it a list per state and keep the any-zone-blocks rule
— a window has two edges and a one-zone guess can only be safe at one of them.

**Credits: `deduct_credits` to spend, `add_credits` to refund or grant. Never read-then-write,
and never restore a previously-read balance.** Both RPCs are atomic single UPDATEs, refuse
negative amounts, and enforce ownership internally (service_role for any user, authenticated
only its own, `anon` no EXECUTE at all) because SECURITY DEFINER bypasses RLS.

**A refund must be a delta, not a snapshot restore** (#91). `number-pool/purchase-with-credits`
used to roll back with `update({ credits: currentCredits })` — the balance read before the
purchase — which silently discarded anything that changed in between. Demonstrated on the live
DB: charge 500, spend 1 on an SMS, then refund. Delta refund gives **999**; the old snapshot
restore wrote **1000**, refunding the unrelated SMS as well.

**Every credit-granting path now uses `add_credits` too** (#92, 2026-07-29): Stripe plan
purchase, point-pack purchase and monthly renewal, plus `cron/auto-buy` and admin grants. All
five previously read the balance and wrote back `current + n`, which silently restored anything
spent in between. The renewal was the most exposed — it lands on active accounts, and Stripe
can deliver while the user is sending. Verified end to end with signed events: buying a 4,000
pack immediately after spending 100 leaves the spend intact, and a redelivered renewal invoice
does not double-grant.

Where a credit write shared an UPDATE with other fields (plan tier, renewal dates), the fields
and the credits are now written separately — the credit half through the RPC. The plan path
alerts if the tier applies but the grant fails, since that leaves a paid-up account with no
credits.

`admin/users/action` grant_credits also now keys the ledger row on the id from its own email
lookup rather than the body-supplied `userId`; if those ever disagreed the credits and the
ledger row landed on different accounts.

That route also told the customer "Credits refunded" without checking whether the refund
succeeded. It now reports `refunded: false` and raises an admin alert when it fails — and when
a number was ordered but the row failed to save, the alert says so explicitly, because that
leaves a live billing number with no owner.

Two paths had read-modify-write races; `schedule/bulk` was the worst, writing back a `credits` value
read *before* its send loop began and discarding any concurrent spend.

Current coverage — every automated path has all three gates:

| path | DNC | quiet hours | credits |
|---|---|---|---|
| `cron/process-scheduled` | ✓ | ✓ | ✓ |
| `cron/process-drips` | ✓ | ✓ | ✓ |
| `cron/process-ai-drips` | ✓ | ✓ | ✓ |
| `cron/send-appointment-reminders` | ✓ | ✓ | ✓ |
| `campaigns/run` | ✓ | ✓ | ✓ |
| `sms/send` | ✓ | exempt (human-initiated) | ✓ |
| `messages/schedule/bulk` | ✓ | ✓ | ✓ |

All seven paths route through `checkSmsAllowed`. `cron/process-scheduled` was the last
holdout — it kept an inline sender-local quiet-hours block plus its own `check_dnc` call
until #60 (2026-07-29). Both accounts here are `America/New_York` 08:00–20:00 while 99 of
their leads are Central or Mountain, so its 08:00 release was landing at 07:00 or 06:00.

**Ordering constraint in `process-scheduled`:** the guard runs *after* the lead loads (it
needs `lead.state`) and *before* the `pending → sending` claim from #44. Moving it after
the claim would strand a quiet-hours deferral in `sending` forever. Non-retryable blocks
mark the row `failed` with the reason; retryable ones leave it `pending`.

Known limitation: timezone resolution is state-level. `leads.zip_code` would be more
precise for split states and would remove the both-zones conservatism above;
`lib/geo/selectClosestNumber.ts` already does zip-based work if that's ever wanted.

---

## Two of the four "orphaned" pages were not orphaned (#89)

`/messages` (1177 lines) and `/analytics-automation` (317) were deleted — no navigation links
and no module imports. `/messages` was a superseded standalone implementation of the
conversation inbox; the live one is `/texts`, a 63-line wrapper around
`components/texts/TextsLayout.tsx`. CLAUDE.md's Key Pages listed the dead one and is corrected.

**`/dnc` and `/sms-analytics` were kept, and deleting them would have broken two pages.**
Neither is linked from navigation, which is how they were mistaken for dead — but both are
**imported as components**:

```ts
app/(dashboard)/settings/page.tsx:21   import DNCPage from '../dnc/page';        // Settings -> DNC List tab
app/(dashboard)/analytics/page.tsx:22  import SMSAnalyticsPage from '../sms-analytics/page';  // a section of Analytics
```

They are shared components that happen to live at a route path. Worth moving into
`components/` so the duplicate route surface goes away, but that is a refactor, not a deletion.

**Checking for inbound *links* is not enough to call a page dead — check for module imports
too.** A first pass here also nearly deleted `app/api/messages` and `app/api/dnc`, both live
API route trees, because a `find` pattern matched on the bare directory name rather than the
`app/(dashboard)/` path. Verify what a glob actually matched before removing anything.

---

## Inbound was dead for six months — Ed25519 key parsed wrong (#108, 2026-07-31)

**Every inbound webhook was rejected with 401** from the day signature verification was added
until 2026-07-31. The last inbound row before the fix is dated **2026-01-20**.

Telnyx publishes its webhook public key as **raw base64 Ed25519 — 32 bytes**. The verifier
passed those 32 bytes to `crypto.verify` as `{ format: 'der', type: 'spki' }`. They are not:
SPKI-wrapped Ed25519 is 44 bytes, the raw key behind a 12-byte ASN.1 header
(`302a300506032b6570032100`). Node could not parse it:

```
Failed to read asymmetric key
error:0688010A: asn1 encoding routines::nested asn1 error
error:068000A8: asn1 encoding routines::wrong tag
```

The surrounding `catch` turned that into `401 Signature verification failed`.

**The key was never wrong.** It decodes to exactly 32 bytes, fails to parse as-is, parses as
`ed25519` once wrapped. The fix wraps a 32-byte key and passes through anything already 44.

### What it broke

Everything inbound: replies never reached Messages, leads were never created from inbound texts
(so #95's work could not run), the receptionist never replied, flows never advanced, drips never
stopped on reply, and **opt-outs were never honoured** — STOP or custom keyword.

**Outbound was completely unaffected**, so sending looked healthy the whole time.

### Why nothing caught it

It failed **closed and silently**. The handler returned before any database write, so the
"inbound replies are being lost" alert added in #80 could never fire — the code that alerts
never executed. Telnyx retried and gave up. No error surfaced anywhere in the product.

### How it was found, and the rule that follows

Not by reading code. The webhook URL, messaging profile, public key value and number-to-user
lookup were all checked first and were all correct.

It took **manufacturing a real inbound** — sending an SMS from one of the account's own numbers
to another — and reading the Vercel runtime log, which showed the handler entered with valid
signature headers and dying on the key parse.

> **Outbound working tells you nothing about inbound.** They share almost no code path. Any
> end-to-end check has to send a message *into* the system, not just out of it. Two Telnyx
> numbers on the same account are enough to do that without involving a handset.

A second rule from the same hunt: `vercel logs <url>` prints a **snapshot and exits**, it does
not follow. To catch a webhook you must trigger the event and read within a minute or two, or
the window has already rolled past.

### Verified after the fix

Probe inbound saved, lead and thread created; a real `POT` opt-out from an AT&T handset
recognised, DNC written, lead purged (#109); `check_dnc` blocks the number afterwards.

## Inbound SMS creates the lead (#95)

An inbound message now **finds or creates** the lead in `handleInboundSMS`, before anything
AI-related runs.

It used to be lookup-only. Lead creation existed, but **only inside the Receptionist handler**,
which returns early when a user has no `receptionist_settings` row or has it disabled — true
for **6 of 7 accounts**. So a first-time texter produced a thread and a message with
`lead_id NULL` and nothing else: absent from `/leads`, and `ContactInfoPanel` and
`SessionsPanel` are both gated on `lead_id`, so even "convert to client" was unreachable. The
contact could be read and replied to, and nothing more.

Note the intent was already auto-create — `receptionist_settings.auto_create_leads` defaults to
**true**. It was simply unreachable behind `enabled` (default **false**). An explicit `false`
is still honoured; a user with no settings row gets the default.

**Recording who contacted you is not the AI's job.** Whether the receptionist replies is a
separate decision from whether the person exists, and coupling them is what caused this.

### Phone format is why those threads were orphaned (#95)

Both orphaned threads turned out to have a lead already — the lookup just could not see it.
`leads.phone` holds whatever was imported, while Telnyx always sends E.164, and 2 of 207 rows
were stored as `4079513717` and `18708824134`. An exact `phone = from` comparison misses those.

Harmless while the lookup was read-only — the thread simply stayed unlinked. **But once the
webhook started creating a lead when none was found, it would have minted a duplicate on every
inbound from those contacts.** The lookup now goes through `find_lead_by_phone(user_id, phone)`,
which tries an exact match first (common case, uses the index) then falls back to comparing
`normalize_phone()` on both sides — the same helper `check_dnc()` uses, so a number matches
here exactly when it matches there.

All 207 leads are E.164 as of 2026-07-29; the migration normalised the two stragglers.

**Backfilled:** the 62-message thread now links to its existing lead (Tripp Browning), with all
62 messages attached. No duplicate was created — leads stayed at 207. The remaining orphan is a
2-message wrong number ("my bad meant to send that to my other number lol") deliberately left
alone.

Other `.eq('phone', from)` sites remain in the webhook (lines ~255, 461, 512, 599, 792). All are
selects or updates — **none creates** — so they carry no duplicate risk, and they work today
because the data is now uniformly E.164. Worth routing through the RPC if imports ever
reintroduce mixed formats.

---

## Opt-out erases the lead, keeps the suppression (#109, 2026-07-31)

`purge_lead_after_opt_out(user_id, phone)`, called from the SMS webhook's opt-out branch once
`add_to_dnc` has succeeded. Applies to **every** opt-out — standard keyword or the user's custom
one.

**Deleted:** the lead row, which cascades messages, thread, notes, activities, follow-ups, drip
enrollments, scheduled sends, flows and sessions. Plus `sms_messages`, `sms_responses`,
`receptionist_logs` and `emails` — those reference leads with `ON DELETE SET NULL`, so they
survive the cascade holding message bodies and phone numbers. They are cleared **before** the
lead, because the cascade nulls the `lead_id` needed to find them, and are also matched on the
normalised phone for rows written before a lead existed.

**Kept:** the `dnc_list` row. It is what stops the number being messaged again *and* the evidence
the business was told to stop. Delete it and the same number returns in the next CSV import, gets
messaged, and nothing records that anyone ever asked not to be — the exact violation the opt-out
prevented. This works because `dnc_list` is keyed on `(user_id, normalized_phone)` with no
reference to the lead, and `check_dnc()` matches on the phone alone.

Also kept deliberately: `dnc_history`; `points_transactions`, `transactions`, `payments`
(financial retention, #93); `calendar_events` (a booked appointment may still happen); `clients`
(someone converted is a customer, not a lead).

**Two guards, because the failure is unrecoverable:** the RPC refuses to run unless a `dnc_list`
row already exists, and the webhook only calls it when `add_to_dnc` reported no error. A failed
suppression can never produce an erased lead with nothing stopping the next message.

### Custom opt-out keywords

`user_settings.opt_out_keyword` is appended to first messages ("Reply <word> to opt out") and
matched by `isOptOut()`. **STOP and the standard list always work regardless** — the campaign
registers `STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT` with `subscriberOptout: true`, carriers test
it, and TCPA damages run $500–$1,500 per message after a valid opt-out.

Validation added (#108 era): single word, 2–20 alphanumerics, uppercased, and **`YES`, `START`,
`UNSTOP`, `HELP`, `INFO`, `CANCEL` are rejected**. `YES` is the dangerous one — it is an opt-in
keyword *and* what leads reply to confirm an appointment, so allowing it would permanently DNC
every lead who confirmed a booking.

**Telnyx intercepts registered keywords at the platform level.** A reply of `YES` got Telnyx's
own auto-response ("You have successfully subscribed…"), not the campaign's registered
`optinMessage` and not anything from this app. Do not assume STOP/START/YES/HELP reach the
webhook.

### Verified in production

Real `POT` from an AT&T handset: lead created by the inbound and destroyed in the same request,
thread and message gone, one `dnc_list` row left, `check_dnc` returns `on_dnc_list: true`.

## The global DNC list (#88, #93)

`dnc_global` blocks a number for **every tenant**. `check_dnc()` has always read it. For a
long time nothing wrote to it, so that branch could never evaluate true — the "global" half of
the DNC model CLAUDE.md describes was scaffolding.

**It has two writers now:**
- account deletion promotes a departing account's opt-outs into it (#93)
- `POST /api/admin/dnc-global` — operator-only, for numbers that must never be contacted by
  anyone (litigators, repeat complainants, imported registries)

**Always write through `add_to_global_dnc()` / `remove_from_global_dnc()`, never the table.**
`check_dnc()` matches on `normalized_phone = normalize_phone(input)`; an entry normalised any
other way silently fails to block, which is the worst outcome this table can produce. The RPCs
own normalisation and are `service_role` only — `anon` and `authenticated` have no EXECUTE
(verified: both return 42501).

**RLS: nobody can read it from a client.** The old `"Users can view global DNC list"` policy
was `FOR SELECT` to `{public}` with `USING (true)` — anon-readable, verified with the public
key. That was tolerable while the table was permanently empty and is not now that deletions
populate it with real numbers and free-text reasons. Dropped; the remaining `USING (false)`
policy denies everyone, and `check_dnc()` reaches it as `SECURITY DEFINER`. Confirmed with a
row present: service_role sees 1, anon sees 0.

Removing an entry un-blocks someone who opted out, so `/api/admin/dnc-global` logs the
operator's email on both add and remove.

---

## Account deletion (#87)

`app/api/user/delete-account/route.ts`. Purges **47 tables** explicitly; 13 more cascade from
`public.users`. It used to delete six, leaving threads, clients, notes, AI flows, templates,
receptionist settings and ~30 other tables of personal data behind.

Every delete is error-checked and failures are collected. **A failed auth deletion now returns
an error** — it previously returned `success: true` unconditionally, with a comment saying so,
which told users their account was gone while their login still worked. Partial failures raise
an admin alert.

Ordering that matters: purge tables → delete `public.users` → delete the auth record **last**.
`public.users` references `auth.users`, so removing the profile first is what lets the auth
delete succeed. Stripe subscriptions are cancelled first, and phone numbers are released from
Telnyx and un-assigned from `number_pool` before any of it.

### Retention, and why opt-outs are promoted to global (#93)

`dnc_list`, `dnc_history`, `payments` and `transactions` are excluded from the purge — opt-outs
must outlive an account by law, financial records have their own retention requirements.

Excluding them was **not enough on its own**: all four had `ON DELETE CASCADE` to `auth.users`,
so the database destroyed them when the auth record went. Now `ON DELETE SET NULL`, and
delete-account stamps `deleted_user_id` before the auth delete so the rows stay attributable
(`payments`/`transactions` had `user_id NOT NULL`, relaxed for this).

**Retention alone would have been worse than the bug.** `check_dnc()` matches
`dnc_list WHERE user_id = p_user_id` or the global list, so once `user_id` is nulled a retained
row matches neither — the record survives while enforcement silently stops, and the row *looks*
like protection. So a deleting account's opt-outs are **promoted into `dnc_global`** by
`promote_user_dnc_to_global()`, called before the auth record is removed.

Why global: this platform shares a number pool and reassigns numbers between tenants (#38). A
consumer who texted STOP to a pool number opted out of a number that will be reused.
Over-blocking is the safe direction. **The trade-off, stated plainly:** a deleted tenant's
opt-outs then suppress those numbers for every tenant. If numbers ever become strictly
per-tenant, revisit — the promotion is one function call and can simply be dropped.

This also gives `dnc_global` its first writer. `check_dnc()` has always read it and nothing had
ever written to it (#88).

Verified end to end: two accounts, one records an opt-out via `add_to_dnc` and is then deleted.
Before deletion the number is blocked for its owner and **not** for the other tenant (correct
scoping); after deletion the `dnc_list` row survives with `user_id` null and `deleted_user_id`
preserved, one entry is promoted, and `check_dnc` still reports the number blocked.

**Trap worth remembering:** `information_schema.constraint_column_usage` does **not** reliably
report cross-schema foreign keys — it showed zero non-cascading FKs on these tables and missed
all four CASCADEs to `auth`. `pg_constraint` is authoritative:

```sql
SELECT cl.relname AS child, ns.nspname||'.'||pf.relname AS parent, c.confdeltype
FROM pg_constraint c
JOIN pg_class cl ON cl.oid=c.conrelid
JOIN pg_class pf ON pf.oid=c.confrelid
JOIN pg_namespace ns ON ns.oid=pf.relnamespace
WHERE c.contype='f';
```

`confdeltype`: `c`=CASCADE, `n`=SET NULL, `a`=NO ACTION, `r`=RESTRICT.

---

## Audit 2026-07-29 (overnight) — what it found

**`deduct_credits` did not exist — created 2026-07-29 (#90).** Ten code paths called it while
`pg_proc` had no function matching `%credit%` in any schema and no migration defined one.
Verified at the time: `PGRST202 — Could not find the function`. CLAUDE.md listed it under Key
RPC Functions and this file instructed "always use the `deduct_credits` RPC" — both described
a function that was never created.

Now created by `supabase/migrations/create_deduct_credits_rpc.sql` and applied to the linked
project. **Four things about it are load-bearing:**

1. **Parameter names must stay `user_id` / `amount`.** PostgREST matches RPC arguments by
   name. `follow-ups/send-calendar-link` was passing `user_id_param` and would have kept
   failing even after the function existed — the same bug in a second costume.
2. **Parameters are qualified `deduct_credits.<name>` throughout.** Unqualified, plpgsql
   resolves `user_id` to a *column*, which is how a function like this silently updates the
   wrong rows.
3. **The balance check lives in the UPDATE's WHERE clause**, so read and write are one
   statement. Verified: 50 concurrent deductions lost nothing, and 30×100 against a 1000
   balance stopped at exactly 10 without going negative.
4. **`SECURITY DEFINER` bypasses RLS, so it enforces ownership itself.** service_role may
   deduct for any user; an authenticated caller may only spend their own balance — two
   callers (`campaigns/run`, `follow-ups/send-calendar-link`) are request-scoped, so
   `authenticated` needs EXECUTE, and without the guard any logged-in user could drain
   anyone's credits by passing their id. Verified: cross-user deduction returns 42501 and
   leaves the balance untouched; own-balance deduction still works. `anon` has no EXECUTE.

Consequences split by caller: `telnyx/send-sms` and `cron/process-drips` **fail closed** (the
send is blocked — UI sending returns HTTP 500), everything else **fails open** (message goes
out, never charged). Nothing has actually broken for a user because the newest row in
`messages` is 2026-02-16, predating every call site. It is total but latent.

Of 24 distinct RPCs the code calls, `deduct_credits` is the **only** missing one — checked
exhaustively. All 47 table references resolve. The rest of CLAUDE.md's RPC list is accurate,
and `is_within_quiet_hours` is called with the right parameter names (a mismatch fails
identically, so it is worth checking when adding RPC calls). `schedule_message` and
`stop_ai_drip_on_reply` exist but no code calls them.

**Clean areas, verified rather than assumed:** RLS is enabled with policies on all 59 public
tables; there are no referential orphans across the nine relationships checked; all five
`vercel.json` crons have route files and verify `CRON_SECRET`, with no unscheduled cron
routes; all 50 page routes resolve in production with no 404s or 500s.

**`dnc_global` is dead-but-load-bearing (#88).** `check_dnc()` reads it, nothing anywhere
writes it, and it is readable by `anon` via a `USING (true)` policy. The global half of the
DNC model CLAUDE.md describes has never existed.

**Four pages ship with zero inbound links (#89)** — `/messages` (1177 lines), `/dnc`,
`/sms-analytics`, `/analytics-automation`. CLAUDE.md documents `/messages` as the live
conversation inbox; the real one is `/texts`, a 63-line wrapper around `TextsLayout`.

**153 fire-and-forget writes across 52 files** — writes whose result is never captured, so a
failure is indistinguishable from success. Most are harmless; the money-adjacent one is
`number-pool/purchase-with-credits` (#91), which does read-then-write credit maths and tells
the user "Credits refunded" without checking whether the refund succeeded.

---

## Known open gaps (not yet fixed, worth checking before assuming otherwise)

**Audit status (2026-07-28).** An overnight read-only audit filed 13 findings under the
`audit` label / "Audit — needs triage" milestone. **10 are fixed and closed**; 3 remain
open and untriaged:

- **#44** — the scheduled-send cron can resend the same SMS every 5 minutes if the
  `status: 'sent'` update fails, with no retry cap. Latent (0 stuck rows). Worth deciding
  whether to mark sent *before* sending, so the failure mode is a missed message rather
  than a loop.
- **#46** — `/api/messages/send-scheduled` is an unregistered duplicate of
  `cron/process-scheduled` with no auth and no quiet-hours check. RLS blocks anonymous
  use; a logged-in user can flush their own queue early. Probably just delete it.
- **#49** — the welcome email to new leads never sends: `app/api/leads/upsert/route.ts`
  calls the client-only `settingsStore`, which always returns defaults server-side. Same
  bug fixed in `/api/email/send` under #16; this route was missed.

Everything else from the audit is closed — see #57 for the index and what each fix was.


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
- **GitHub PAT was exposed in the old MAMP clone's git config — mostly resolved
  2026-07-28.** There used to be a *separate* clone of this repo (the original one) at
  `/Applications/MAMP/htdocs/trippdrip-v8-sprint1`, with a Personal Access Token
  embedded in its `origin` URL, so `git remote get-url origin` printed a live push
  credential. **That clone has been archived and deleted** — verified first that it held
  nothing unique (52 commits behind, every branch already contained in `main`, identical
  env keys apart from a local `DATABASE_URL` credential pointing at the same Supabase
  project). Archive: `~/Archive/trippdrip-v8-sprint1-ORIGINAL-mamp-20260728.tar.gz`
  (34M, full git history, integrity-verified before deletion). **Two residual notes:**
  (1) that archive still contains the PAT and the env files, so treat it as sensitive;
  (2) the token also appeared in a session transcript on 2026-07-28. The token itself was
  never revoked — the user assessed it as low risk (no one else has machine access) and
  folded revocation into the #29 rotation pass. **Don't re-raise as an emergency**, but do
  revoke it when #29 happens; an embedded PAT keeps working until explicitly revoked.
  `/Applications/hyvewyre` is now the only clone, and its own remote is clean.
- **Instant-access pool capacity — 3 verified numbers, so 3 client businesses (#3):** the
  pool numbers *are* TFV-verified and the workaround works (see SMS/Telnyx section; an
  earlier claim here that they were unverified was wrong and is corrected there). The real
  limit is inventory under the declared 1:1 ISV model — scaling it means submitting new TFV
  batches, not just buying numbers. **Never submit a TFV or 10DLC request without the
  user's explicit instruction.**
- **`number_pool.is_verified` is unreconciled (#36):** written once by a seed migration
  that hardcodes `true`, never checked against Telnyx, but gates claim/availability and an
  RLS policy. It happened to be correct, but nothing makes it *checkable* — which is what
  let a bad script masquerade as a discovery for half a day. TFV can also be revoked, and
  this account has already lost numbers to a deactivation once. Claim time already gates on
  `getVerifiedTollFreeNumbers()`, and **the UI half is done** — Settings → Messaging shows
  stored vs. live side by side for admins and highlights disagreement (#43). What remains is
  the scheduled reconciliation that writes the live value back to `number_pool.is_verified`;
  until then the flag is merely *visible*, not self-correcting.

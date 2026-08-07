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

**10 more toll-free numbers ordered and submitted for TFV, 2026-08-05.** Order
`0a40bcce-840c-477c-98a1-455443af3032` completed with `requirements_met: true` — **ordering
toll-free needed no support request or justification**, contrary to the assumption that batches
above 5 required one. $1 upfront + $1/month each; the account went 49.23 -> 30.84 USD, so the
charge included a prorated first month. Auto-recharge is still off.

TFV request `9b2c5fb3-69b6-5dfb-a7b8-0867ec18281d`, status `Waiting For Telnyx`, covering all
ten. Its payload was **copied field-for-field from the approved request** `6723e639` — every
value except `phoneNumbers` and `messageVolume` is byte-identical, read back from the API
rather than retyped. That is deliberate: two earlier TFV attempts here were Rejected before
`6723e639` passed, and the ISV/1:1 framing in that one is what the carriers accepted.

**The justification for holding more than a handful of numbers lives in that copied text**, and
it is deliberately count-free, so it scales without contradicting itself:

> "We are requesting verification for **multiple numbers** because we onboard multiple client
> businesses, each requiring their own dedicated number. No single business uses more than one
> number."

**`messageVolume` was raised 10,000 -> 100,000** (owner's decision, 2026-08-05). The approved
filing declared 10,000 when it covered 5 numbers; verified, this account will hold 13 toll-free
numbers = 13 client businesses under the declared 1:1 model, and traffic beyond the verified
volume is what carriers filter.

**`messageVolume` is an ENUM, not a free-text number.** `"10,000"` and `"100,000"` are accepted;
`"50,000"` and `"50000"` are both rejected with a bare *"The request failed because it was not
well-formed"* (code 10015) and **no field pointer** — so the error does not tell you which field
is wrong. Discovered by bisecting values against a live PATCH.

**PATCH requires the FULL payload**, not the changed field. Sending only `messageVolume` returns
a missing-parameter error for all ~18 required fields. The working shape is: GET the request,
drop `id` / `verificationStatus` / `reason` / `createdAt` / `updatedAt` / `ticketNumber`, reduce
`phoneNumbers` to `[{phoneNumber}]`, change what you need, PATCH that back.

**The ten are in `number_pool` with `is_verified = false`, so they are NOT claimable yet.**
`/api/number-pool/available` requires `is_verified = true`, and an unverified toll-free number
cannot carry traffic — offering one would hand a new agent a number that silently fails to
send. Claimable inventory is still **2** until TFV comes back, and the low-stock alert is
correctly still firing. Flip `is_verified` only when the request reads `Verified`.

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

### The approved campaign read as `pending` for weeks — a two-field status mix-up (#1, 2026-07-31)

**A Telnyx campaign has two status fields, with different vocabularies:**

```
status          ACTIVE | EXPIRED | …
campaignStatus  TCR_PENDING | TCR_EXPIRED | MNO_PENDING | MNO_PROVISIONED | …
```

`getCampaignStatus` returns **`campaignStatus`**. Both callers mapped it with
`if (s === 'ACTIVE')` — a value that field never takes — so everything fell through to
`'pending'`. The live campaign, MNO-provisioned and carrying traffic, was stored as pending
indefinitely.

That is the mechanism behind "**0 numbers are assigned**" in CLAUDE.md, which had been read as a
carrier problem. `autoAssignNumberToCampaign` refuses unless the stored status is
active/approved/mno_provisioned, and the refresh route auto-assigns only on the pending→active
transition. Neither could ever fire. The carrier block (#105) is real and separate — but it was
never reached.

**`EXPIRED` is now terminal, not pending.** Treating it as pending is what let the app poll a
dead campaign forever: the stored id pointed at a `TCR_EXPIRED` campaign, and every refresh
rewrote 'pending' over 'pending'.

**Telnyx does not update a campaign id on resubmission.** It issues a new one and leaves the old
id resolving happily — HTTP 200, `TCR_EXPIRED`, not a 404 — so a stored pointer to a superseded
campaign looks healthy from the app's side. This account held exactly that: the DB pointed at
`4b30019f-a63a-…` while the approved campaign was `4b30019f-a9aa-…` (CAAP953). Corrected in the
live row, and `listCampaignsForBrand` + `pickUsableCampaign` now let refresh adopt the brand's
live campaign instead of polling a corpse.

**Also fixed, and found by writing a test for the mapper rather than by reading it:**
`mapBrandStatus` used `includes('VERIFIED')` — which is **also true for `UNVERIFIED`**. A brand
that failed identity verification was recorded as verified, and the app would go on to create a
campaign and attach numbers against it. Now an exact match.

Both mappers moved into `lib/telnyx10dlc.ts`; they were duplicated across two routes.

### The mock run: `createBrand` works, `createCampaign` was broken for everyone (#1, 2026-08-02)

**Telnyx mock brands are free and are the right way to test this.** `mock: true` on brand
creation costs nothing, and any campaign created under a mock brand is automatically mock with no
registration or recurring fee. They cannot carry real traffic — that is the only thing they do
not prove.

The first ever execution of `createBrand`/`createCampaign` found a blocker:

```
10025 String length out of range
detail: String is too long. Must be maximum 320 characters.
source: {"pointer": "/body/optinMessage"}
```

`generateCampaignDefaults` produced **343 characters**, so *every* per-agent campaign submission
would have failed — **after the brand was created and charged $4.50**, because the brand comes
first. The single existing registration never hit it: CAAP953's `optinMessage` is 305, written by
hand.

**`messageFlow` is not capped, despite looking like the obvious culprit at 920 characters.**
Submitting 920 raises no error and the approved campaign's is 944. Only `source.pointer` settled
it — length alone pointed at the wrong field. When Telnyx returns 10025, read the pointer.

`buildOptinMessage` now guarantees ≤ 320. Load-bearing and non-removable: the business name (the
perceived sender), **every declared message type** (campaign `4b30019f` was rejected 2026-07-28
for omitting marketing while MARKETING was a selected sub-use-case), frequency, rates,
"Consent is not a condition of purchase", HELP, STOP. Removable and removed: the `about <offer>`
clause, absent from the approved campaign. Length still scales with the legal business name — the
full form fits only ~27 characters of it — so a compact form follows and past that the name is
trimmed.

`validateCampaignFields` runs before submission so a future overflow names the field rather than
costing a brand charge to discover. `messageFlow` is deliberately excluded from it.

Two more from the same run:

- **Telnyx validates the email domain.** `ops@mockrun.test` → `10019 Invalid email address`.
  Onboarding accepts any syntactically valid address, so an unroutable domain fails brand
  registration with a message the user cannot act on.
- **Mock brands cannot be deleted** — `DELETE /10dlc/brand/{id}` returns 500. Two now sit on the
  account (`Mockrun Test Co`, `Test Agent Brand`), free and flagged `mock=true`.

**A negative Telnyx balance blocks brand creation entirely**, mock included, with
`20100 Insufficient Funds` — the balance was −$0.46. Same root cause as the July number-order
denials. **Check `GET /v2/balance` first whenever a Telnyx call fails in a way that looks like
permissions or compliance.**

### Agents get TOLL-FREE numbers; the tier difference is quantity (#120, 2026-08-03)

**Growth: 1 toll-free number. Scale: more than 1.** The local number `+18134972176` stays
HyveWyre's own, for acquiring agents, on the existing `MIXED` 10DLC campaign.

**Supersedes the "Growth gets 1 local" reading recorded below on 2026-08-02.** That section's
throughput analysis still stands and is still worth reading; its premise does not.

**Toll-free runs on TFV, not 10DLC**, which takes three things off the launch path:

- no **$19.50 per agent** against $30 of first-month revenue
- no **3–7 day wait** before a new agent can send
- **#119 stops blocking** — sole proprietors cannot complete 10DLC but do not need it for a
  toll-free number, and they are plausibly a large share of the target market
- **#1 becomes post-launch** — per-agent brands matter when agents move to local numbers

**The conflict this creates.** The verified TFV (`6723e639`) says verbatim: *"Each toll-free
number is provisioned 1:1 to a separate, independent client business… No single business uses more
than one number."* **Scale holding more than one directly contradicts what was approved.** The new
TFV request has to describe the real model or the verification does not cover what we do.

**Correction, 2026-08-03 (#130):** the "three methods including verbal consent" criticism below
was **wrong** — that text belongs to the *first rejected* request (`65ad888e`), not the approved
one. The approved record already carries a single web-form method. Verified against the Telnyx
API. The remaining criticism stands and is worse than recorded:

The use case is `Conversational / Alerts` while agents send marketing (Telnyx: *"any non-marketing
content and also marketing content → Mixed"*) — and this is not one field. **Four** fields of the
approved request describe non-marketing traffic: `useCase`, `useCaseSummary`,
`productionMessageContent`, and the consent disclosure quoted inside `optInWorkflow`. Changing
the use case alone leaves three fields describing a product that does not exist, which is the
exact shape of 10DLC rejection #6.

**And the far larger problem (#130): no lead in the system has a consent record at all.**
`leads.sms_opt_in` has `DEFAULT true`, and of 209 leads there are **0** rows in
`contact_form_submissions`. The branded opt-in page works correctly and has never been used;
CSV import, manual entry and the browser extension capture nothing. The approved TFV's
description of consent collection is accurate about a page nobody goes through. **The product's
intake has to change before any filing can honestly describe it.**

**Inventory is now the binding constraint.** 2 numbers available; Telnyx caps at 5 per business
without justification, which is exactly the rejection on `65ad888e`. Every batch beyond that needs
a fresh TFV with the ISV argument (#3).

### Tier design and the throughput numbers behind it (#11, #121, 2026-08-02)

**Growth ($30): 1 local number, LOW_VOLUME. Scale ($98): multiple local numbers, MIXED.**
Scale's extra numbers are for **geographic coverage, not throughput** — a distinction that is easy
to get backwards and expensive to get wrong.

Confirmed against Telnyx rather than assumed:

| AT&T — per campaign | SMS/min |   | T-Mobile — per **brand**, daily | SMS/day |
|---|---|---|---|---|
| LOW_VOLUME (Class T) | 75 |   | Sole Proprietor | 1,000 |
| Standard, vetting 50–74 | 2,400 |   | **Basic — unvetted, the default** | **2,000** |
| Standard, vetting 75–100 | 4,500 |   | Medium / High / Top | 10k / 40k / 200k |

Verizon publishes nothing and filters on content. Toll-free is 1,200/min per number.

**Throughput is not the binding constraint — credits are.** Growth's 3,000 credits/mo is ~100
messages/day and Scale's 10,000 is ~333/day; both sit far below every cap above. LOW_VOLUME is
adequate for Growth despite the name.

**More numbers does not mean more throughput.** AT&T limits per *campaign*, T-Mobile per *brand* —
neither per number. Ten numbers under one brand share the caps of one. If throughput ever needs to
differentiate the tiers, the lever is **brand vetting** (unvetted = Basic = 2,000/day), not number
count.

One thing this design depends on that does not work yet:
[#122](https://github.com/tripptrap/trippdrip-v8-sprint1/issues/122) — `selectClosestNumber` is
wired into **2 of 8** send paths (`telnyx/send-sms`, `campaigns/run`). Scheduled sends, drips, AI
drips, bulk and appointment reminders all use `is_primary`, so a Scale agent's extra numbers buy
nothing on the automated paths. Same shape as the rate-limit gap in #121, and the same fix: one
shared resolver rather than six hand-rolled `is_primary` lookups.

### Numbers are withheld until the business is registered (#1, 2026-07-31)

Onboarding now collects the carrier-registration details in the existing "Set Up Your Business"
step, and **the EIN is optional** — someone without their tax ID can still finish signup. What a
missing EIN costs is the *number*, not the account.

`lib/numberEligibility.ts` → `checkNumberEligibility()` gates all three acquisition paths:
`number-pool/claim`, `number-pool/purchase-with-credits`, `telnyx/purchase-number`. It **fails
closed** — a registration read that errors, or a missing service-role client, refuses. "Cannot
check" is not "allow".

The reason it withholds rather than warns: numbers carry A2P traffic, A2P needs a campaign, a
campaign needs a verified brand, and a brand needs the EIN. Issuing a number first produces the
worst available failure — the user has a number, the app looks finished, and every message is
filtered by carriers with nothing surfaced anywhere.

Two deliberate looser edges:

- **Does not require `brand_status = verified`.** Carrier verification takes 3–7 business days;
  blocking that long leaves a paying user with nothing. A *submitted* brand (brand_id present)
  is enough — campaign attachment happens automatically on approval (#107).
- **Sole proprietors are exempt from the EIN check.** They register on an SSN and Telnyx asks for
  no tax ID. Mirrors the register route.

`/api/telnyx/10dlc/register` no longer 400s on a missing taxId — it saves the details and returns
`submitted: false`, so a client cannot accidentally submit an incomplete registration nor skip a
complete one. Its resubmission guard is keyed on **`brand_id`**, not status: a draft has never
reached Telnyx and must stay editable, where previously any row with status `pending` was frozen.

`/api/number-eligibility` (GET) exists only so the UI can *explain* the refusal — onboarding's
number step and the Phone Numbers page both read it. It is not the boundary; hiding a button
never is.

### The 10DLC campaign is approved; the number cannot attach to it (#105, 2026-07-30)

**Do not use campaign `4b30019f-a63a-3fb0-9c87-1ff6d84e7ac6` (CJFUY00) as the reference — it is
a superseded failed attempt.** Eight campaigns exist under this brand and six are dead. Reading
that old id sent a session down an appeal-and-resubmit path for a campaign that was already
approved. Always list with `GET /10dlc/campaign?brandId=<id>` and take the one whose
`campaignStatus` is `MNO_PROVISIONED`. Full rejection history:
[`docs/10DLC_REJECTION_HISTORY.md`](10DLC_REJECTION_HISTORY.md).

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

### The ledger is authoritative from 2026-08-05, and not before

`deduct_credits` used to move the balance and write nothing. **Twelve call sites use it** —
the receptionist AI, every cron, campaign runs, drips, bulk sends — so most spending left no
trace at all. Measured before the fix: `points_transactions` summed to **+2600** against a
live balance of **59,568**. The ledger could not be reconciled to the balance in either
direction, and no screen reading it could be right.

It now writes the row itself, in the same transaction as the charge, so the two cannot
disagree; a failed ledger write rolls the charge back. Callers pass a `reason` for the
description, and **must not write a row of their own** — `telnyx/send-sms` and
`pointsSupabaseServer` both did, and that is now a double count.

**This is not retroactive.** Charges made before 2026-08-05 00:52 UTC were never recorded and
cannot be reconstructed. Any all-time total is a floor, not a figure.

### The invariant, and the three ways to break it

Every change to `users.credits` goes through `deduct_credits` or `add_credits`. Both are
`SECURITY DEFINER`, both are `EXECUTE`-granted to `service_role` only, and both write their
`points_transactions` row **inside the same transaction** as the balance change. Nothing else
writes the ledger: `authenticated` has `SELECT` and nothing else on that table (#144), including
no `TRUNCATE` — which ignores RLS and would have emptied it for every account at once.

Three specific ways a future change breaks this, all found by adversarially auditing the fix:

1. **Calling an RPC and also inserting a row.** That is a double count, and every points figure
   reads the ledger. The three Stripe webhook branches pass `write_ledger => false` *because*
   they insert first — their row is the `stripe_session_id` idempotency claim. That flag is the
   only thing keeping plan grants, point packs and renewals at one row. Deleting it as
   "redundant now" doubles the three highest-value paths in the product.
2. **Adding a hand-written insert next to `add_credits`.** Recommended by two of the three audit
   agents for `stripe/change-plan` and the number-pool refund; both already get their row from
   the RPC. Acting on stale advice is how this regresses.
3. **A session client.** `EXECUTE` is `service_role` only, and column grants let `authenticated`
   write just `business_hours`, `business_name`, `timezone`, `updated_at`. A route using
   `createClient()` gets *"permission denied for function"* — silently, if the error is not
   checked, which is exactly how AI rewrites and step generation were free for months.

**`amount_paid` is integer cents.** It was declared `numeric` for a few minutes on 2026-08-05;
passing 12.7 stored 13, silently. Money that rounds without saying so surfaces as an
unexplainable discrepancy much later. It is now `integer`, so a fractional value is a hard error
at the call.

`deduct_credits` also carries `write_ledger` purely for symmetry. Nothing passes it. It exists so
the first debit path that needs a pre-written guard row has the correct option available, rather
than hand-inserting alongside the RPC — which would be an automatic double count.

### "How did I use over 300 points?" — nobody did

Worth keeping because the investigation was longer than the answer. Real spend that day was
**31 points**: 28 from `receptionist_logs` (14 AI replies × 2, plus 3 canned after-hours at 0)
and ~3 for SMS. The 300 came from the UI, not the balance.

Every points figure in the app was wrong, each differently, and all were fixed together:

| surface | was | cause |
|---|---|---|
| `/credit-history` "Total Spent" | 425 | all-time sum, no date filter, unlabelled — **this is the number that prompted the question** |
| `/points` "This Week" | 0 | filtered on `t.type` / `t.amount`; the columns are `action_type` / `points_amount`, so it matched nothing and read 0 for every user, forever |
| `/analytics` "credits used" | −49,568 | `monthly_credits - credits` — not a usage figure, and negative for any account holding more than its grant |
| dashboard | "of 0 monthly" | read `monthly_credits`; the API returns `monthlyCredits` |

### Two ways to bound a balance when there is no audit table

Both were needed to settle it, and neither is obvious:

- **`pg_stat_statements`** survives across sessions and counts every execution. It showed 133
  `deduct_credits` and 62 `add_credits` calls since 2026-07-25. Careful: it counts *calls*,
  not successful charges — a call that RAISEs still counts, and so do zero-amount permission
  probes. 128 successful deductions against a ~430-point decline is ~3.4 points each, which
  is ordinary SMS and AI traffic, not a runaway.
- **This project's own session transcripts** under
  `/Users/trippbrowning/.claude/projects/-Applications-hyvewyre/` contain dated `credits`
  readings printed by earlier live queries. Grepping them reconstructs a balance history that
  exists nowhere in the database. The readings run 59,998 → 59,568 with rises in between,
  which is what 62 refund calls look like.

An agent asserted "no historical balance exists to diff against" and it was false both ways.

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

### `SECURITY DEFINER` + anon grant = cross-tenant writes (#114, 2026-08-02)

**Verify a revoke by re-running the attack, not by querying grants.** This one nearly shipped
as "fixed" twice.

Fifteen `SECURITY DEFINER` functions were granted `EXECUTE` to **`anon`**. SECURITY DEFINER
bypasses RLS; the anon key is public by design. Each took the tenant as an ordinary parameter,
so the caller chose the account. Proven, not inferred:

```
POST /rest/v1/rpc/archive_thread   anon key, no session, another account's thread
  -> HTTP 204, is_archived true
POST /rest/v1/rpc/add_to_dnc       anon key, no session, another account's user_id
  -> {"success": true, "action": "added"}, row written
```

**The trap: `REVOKE EXECUTE … FROM anon` alone does nothing, and looks like it worked.**
Postgres grants EXECUTE to `PUBLIC` by default and anon inherits it, so the named revoke removes
a grant that was never the one in force. The obvious verification is blind to this — `aclexplode`
renders PUBLIC as grantee **oid 0**, which never joins to `pg_roles`, so a check for
`rolname = 'anon'` reports clean while the function stays world-callable. The first revoke passed
that check and the attack still returned HTTP 200. **Always `REVOKE … FROM PUBLIC, anon`.**

Two different fixes, on purpose:

- **Thread RPCs** (`archive_thread`, `unarchive_thread`, `bulk_archive_threads`,
  `add_thread_tag`, `remove_thread_tag`) — scoped to `auth.uid()` *and* revoked. Their only
  caller is a logged-in user acting on their own thread.
- **The other ten** — revoked only, **not** scoped. They take the tenant as a parameter because
  their callers are server-side: the SMS webhook calls `add_to_dnc` as `service_role` while
  handling an inbound STOP, where `auth.uid()` is NULL. Adding a caller-scope predicate there
  would silently break opt-out persistence — #34 all over again.

**Closed 2026-08-02 (#114).** `authenticated` is revoked from all ten; they are service-role only
now, matching the shape the already-safe functions were in (`purge_lead_after_opt_out`,
`release_pool_number`, `check_rate_limit` …). Ten call sites moved to the service-role client
first — the four `/api/dnc` routes, the three `/api/referrals` routes, `/api/sms/send`, and the
two `smsGuard` callers (`messages/schedule/bulk`, `campaigns/run`). `schedule_message` and
`stop_ai_drip_on_reply` had **no caller in the codebase at all**.

The tenant still comes from the verified session in every route, never from the request body —
that was already true, which is why the routes were never the hole. The hole was that the RPC
could be called *without* the route.

One more found on the way: **`complete_referral` takes only a referral id and verifies no
ownership whatsoever** — it marks any pending referral complete and grants the referrer a free
month. Service-role-only now, but the function itself is still unguarded if anything server-side
ever passes it an id from user input.

Verified by attacking with a real session, not by reading grants:

```
authenticated, another account's user_id:  remove_from_dnc -> 42501 / 403
                                           add_to_dnc      -> 42501 / 403
same session, through the routes:          /api/dnc/add    -> 200
                                           /api/dnc/check  -> on_dnc_list true
                                           /api/dnc/remove -> 200
service_role add_to_dnc                    -> 200  (STOP path intact)
```

and the write landed under the test user, not the account named in the attack.

**And the one the sweep caught last: `add_credits` let users mint their own credits.** Both
credit RPCs are SECURITY DEFINER and were granted to `authenticated`. Their guard —

```
IF v_role <> 'service_role' AND auth.uid() IS DISTINCT FROM user_id THEN RAISE
```

— stops you acting on *another* user's balance, and **permits acting on your own**. A fresh test
account, its own session, one request with `amount: 999999` → HTTP 200, balance 0 → 999,999.
Credits are what the point packs sell, so that was revenue, not data.

Both are service-role only now, with three call sites moved first (the charge and refund in
`number-pool/purchase-with-credits`, `follow-ups/send-calendar-link`, `campaigns/run`). The
per-user guard inside the functions is kept as defence in depth, but **the grant is the control**.

**The lesson that ties all three together:** each was found by a check that *looked* sufficient
and wasn't — a grants query blind to PUBLIC, a route audit that never asked whether the RPC could
be called without the route, and a sweep that tested "mentions `auth.uid`" rather than "is
actually scoped". Every one was settled by running the attack. **Verify authorization by
attacking it, never by reading it.**

What remains reachable by `authenticated` is only the five thread RPCs, and that is deliberate —
they carry `AND user_id = auth.uid()` inside. Confirmed: a logged-in user calling `archive_thread`
on another account's thread gets HTTP 204 and the row is **unchanged**.

### The two ways a write reports success without writing (#110, 2026-08-02)

Checking `error` is necessary and **not sufficient**. Both AI-toggle routes checked it and
still lied.

**1. Swallowing the error on a guess about schema.** Both routes did this:

```ts
if (error.message.includes('ai_disabled')) {
  return NextResponse.json({ ok: true, updated: 0, message: 'ai_disabled column not found' });
}
```

`threads.ai_disabled` exists (boolean, default false), so the branch protected against
nothing — while converting *any* error naming the column (permission, type, policy) into a
reported success. The user flips "AI off", the UI confirms, and the AI keeps replying on
their behalf. **Defensive code written against a schema doubt that was never checked is not
defensive; it is a silent failure with a comment on it.** Check the column once, at the
source, and then trust it.

**2. A guarded UPDATE that matches zero rows.** `manage`'s `toggle_ai` ran:

```ts
.update({ ai_disabled: disable }).eq('id', threadId).eq('user_id', user.id)   // no .select()
```

A zero-row match returns `error: null, status: 204` — **indistinguishable from success**.
Wrong `threadId`, or another tenant's thread, and the route answered *"AI disabled — you
have taken over this conversation"* having touched nothing. This is the same trap as the
cron's pending→sending claim in #61.

**The rule: any UPDATE whose `.eq()` filters can legitimately match nothing must
`.select()` and check the row count.** The filter that scopes a write to the current user
is exactly such a filter.

Verified after the fix, against a real session rather than by reading: own thread → 200 and
the column really changed; nonexistent thread → 404; another tenant's thread → 404 with
that row provably unmodified; bulk `all: true` → `updated: 1`, only the caller's own thread.
The cross-tenant refusal says "Conversation not found" rather than a permission error, so it
does not confirm the thread exists to someone probing.

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

`process-scheduled` also gained a **`.limit(100)` batch cap**, which the original function did
not have. This is a consequence of the fix, not unrelated tidying: `maxDuration` is 60s and each
iteration does several round trips plus a Telnyx send, so an uncapped backlog would time out
mid-loop and strand rows in `sending`. That risk was theoretical for as long as the fetch
returned zero rows. Oldest first, cron every 5 minutes → a backlog drains at ~1,200/hour.

### The second reason nothing sent: `sending` violated a CHECK constraint (#61, 2026-07-31)

Fixing the fetch above did **not** make a single message send. It made the next failure
reachable, and that one had also been there from the beginning:

```
scheduled_messages_status_check
  CHECK (status = ANY (ARRAY['pending','sent','failed','cancelled']))
```

`process-scheduled` claims a row before sending it — `pending → sending → sent` — so two
concurrent runs cannot both send the same message. **`sending` was not an allowed value**, so
every claim failed with `23514` and every message was skipped with *"Could not claim … skipping
to avoid a double send"*. Migration `allow_sending_status_on_scheduled_messages.sql`, applied and
verified against the linked project.

**These two faults were independent, and each fully masked the other.** Fixing only the fetch
changes nothing observable; fixing only the constraint changes nothing observable. That is worth
remembering the next time a pipeline "reports success and does nothing" — the first root cause
found may not be the only one, and a fix that produces no visible change is not necessarily wrong.

The failure counter is also misleading here: the claim failure increments `failed` but writes no
status, so the run reports `failed: 2` while both rows stay `pending` with `error_message` NULL
and are retried forever. A `failed` count with no failed rows means the claim, not the send.

**Verified end to end in production, 2026-07-31 22:56Z** — the first automated messages this
system has ever sent. Both left `+18134972176`, and Telnyx returned `message.received` **and**
`message.finalized` for each (`04769e26…`, `f896fc50…`), so delivery is confirmed by the provider
rather than inferred from a local status. Before this, `messages` held 64 outbound rows and
**0** with `is_automated = true`.

One gap the send exposed: the `messages` insert omitted `message_sid` and `provider`, and
`handleDeliveryStatus` matches on `.eq('message_sid', …)`. Automated messages could therefore
never leave `sent` — no `delivered`, no `failed` — and the analytics delivery rate silently
excluded all of them. Both fields are now recorded (commit `7c14002`).

### Vercel Cron works — but re-registers on every production deploy

Worth knowing before concluding it is broken, which cost time here. After a production
deployment, Vercel re-registers the cron definitions against the new deployment id, and they do
not fire for several minutes. Measured: deployment at 22:59Z, cron config `updatedAt` 23:01Z,
**first invocation 23:20Z** — a ~19-minute gap during which nothing fires at all.

Sampling the logs during that gap makes a healthy scheduler look dead. Compounding it,
`vercel logs <url>` returns only the last 100 entries, and the dashboard polls `/api/texts/threads`
every 5s — so the visible window is about **92 seconds**. A single `vercel logs` call cannot
observe a `*/5` cron at all; sample repeatedly at a shorter interval than the window and cover a
boundary. Confirmed healthy afterwards: `process-scheduled` at 23:20:35 and 23:25:35, exactly
five minutes apart, plus `process-drips` and `process-ai-drips`.

The GitHub Actions backup (#102) is real but **throttled**: its `*/5` schedule actually fires
roughly hourly (12:12, 14:33, 16:18, 17:55, 19:09, 20:35, 21:42, 22:40 on 2026-07-31), which is
normal for GitHub's shared scheduler. It is a safety net against Vercel Cron failing, not a
second timely scheduler — and it covers **only** `process-scheduled`. The other four crons have
no backup.

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

## Resubmitting a TFV makes the number UNVERIFIED until re-approved (#3, 2026-08-03)

Confirmed by Telnyx support, verbatim:

> if you submit a new Verification Request for an already approved toll-free number, it will be
> overwritten and become unverified until the new request is approved

**So the rewrite in `docs/TFV_DRAFT.md` must not be submitted.** Doing so takes the three
toll-free numbers unverified for the length of the review — days to weeks — and every agent on a
toll-free number stops sending. The draft is correct and ready; submitting it is the dangerous
part.

Two things are with Telnyx's compliance team and must come back before anything is filed:

1. Whether the three numbers are still covered after being **released and re-acquired**. They were
   released when the account was suspended for non-payment and re-bought 2026-07-26. Support
   confirmed the verification still reads Verified and lists them, but could not confirm coverage
   survives a release — it is not documented.
2. The safe path to update a Verified request without a service gap, and how to request
   100–1,000 numbers as an ISV.

**The rule this establishes: never resubmit to correct a Verified record.** Ask compliance for an
amendment path first. The instinct to "just resubmit with the right text" costs sending on every
covered number.

## Six columns CLAUDE.md documented that do not exist (#109, #112, 2026-08-03)

The issue named two. Checking **every** column the file documents found six:

| documented | reality |
|---|---|
| `threads.ai_enabled` | it is **`ai_disabled`** — opposite polarity |
| `threads.contact_type` | computed per request, never stored |
| `threads.last_message_at` | use `updated_at` |
| `campaigns.lead_count` | the column is `total_leads`. `/api/campaigns` computes a `lead_count` **response field**, which is what made the doc look right |
| `campaigns.tags_applied` | the column is `tags` |
| `leads.last_contacted` | the column is `last_interaction_at` |

All six were documentation-only — the code computes the value or falls back
(`l.last_contacted || l.created_at`), so nothing was visibly broken, which is exactly why they
survived. `lib/threadForSend.ts` already carried a comment from somebody who had tripped over
`last_message_at`; the cost was being paid quietly.

**Run `scripts/verify-claude-md-columns.py` after any schema change.** It parses the
``#### `table` `` blocks out of CLAUDE.md, compares them against `information_schema`, and exits
non-zero on a mismatch, so it can go in CI. Currently: 103 documented columns across 15 tables,
all present.

### Why a wrong doc is worse than no doc

CLAUDE.md is the first file every session reads, and its own instructions warn that a column the
code assumes may not exist — `user_telnyx_numbers.capabilities` shipped a real bug exactly that
way. A doc asserting a column that is not there is a trap for whoever trusts it instead of
checking, and it cost time in this session before it was fixed.

**`ai_enabled` was the dangerous one** — not because it is missing, but because the real column
has the *opposite polarity*. Writing `ai_enabled: false` to mean "AI off" turns it **on** if the
name is ever taken literally. `/api/threads/[id]` now accepts `ai_enabled` in its request body,
which is the natural thing for a caller to send, and inverts it into `ai_disabled`.

## Which tenant an inbound belongs to (#111, 2026-08-03)

`resolve_inbound_tenant(p_to, p_from)` is the single answer. It returns
`(user_id, matched_by, ambiguous)` — `matched_by` so a guess is logged as a guess, `ambiguous`
so the caller can refuse rather than pick.

Order, and why:

| step | signal | authoritative? |
|---|---|---|
| 1 | `user_telnyx_numbers` by receiving number, **any status** | yes |
| 2 | `number_pool.assigned_to_user_id` by receiving number | yes — and was never consulted before |
| 3 | `threads` by sender, **only if one tenant matches** | a guess |
| 4 | `leads` by sender, **only if one tenant matches** | a guess |

**The receiving number is the only thing that identifies an account.** Everything after it is
inference, and the handler's own comment said so long before this was fixed: *"can route to the
wrong tenant if two tenants have the same lead."*

### Normalising alone would have made it worse

The two sender-based steps compared phone strings exactly, so a lead stored as `(813) 465-8966`
was invisible to an E.164 inbound and the message was dropped.

They also used `.single()`, which **errors** on multiple rows — and that accident is the only
reason a shared lead produced a *dropped* message rather than one delivered to the wrong
business's inbox. Fixing the comparison without addressing ambiguity would have removed the
accident and started leaking consumer replies across tenants.

**When a broken lookup is failing safe by accident, fix the safety before the lookup.**

### An unattributable inbound alerts

It is a lead's reply nobody will ever see, and Telnyx does not redeliver. A console line on a
serverless log is the same failure as #80. The alert distinguishes "not our number" from "two
accounts have this contact", and states that an ambiguous message was **not** delivered to a
guess.

### `dnc_list.phone_number` is the caller's string, not the normalised one

`add_to_dnc` stores `p_phone_number` verbatim and the normalised form in `normalized_phone`.
They match today only because every entry so far came from an E.164 inbound.

An entry added by hand through `/api/dnc/add` as `(813) 465-8966` does **not** equal the E.164
Telnyx sends — so the START re-subscribe lookup missed it, and someone who explicitly asked to
resubscribe stayed opted out. **Always compare against `normalized_phone`.**

## Crons now say when they stop (#117, 2026-08-03)

`public.cron_runs` holds one row per invocation, written by `requireCronAuth` — keyed off the
request path, so **a new cron is monitored without anyone registering it**. `find_overdue_crons()`
returns jobs whose last run is older than their grace period, or which have never run.

```sql
SELECT * FROM public.find_overdue_crons();
```

Expected intervals live in that function's `VALUES` list, next to the data they judge, so a
schedule change in `vercel.json` has one obvious place to mirror.

### Peer checking, because a watchdog is itself a cron

Each cron checks the **others** on the way past. Anything scheduled inside this system dies
exactly when it is needed, so there is no dedicated watchdog — any single surviving cron notices
the rest have stopped, and the most frequent runs every five minutes.

That cannot cover them all stopping, so `/api/cron/heartbeat` is called by the **GitHub Actions**
workflow, which does not depend on Vercel's scheduler. It is the only check that survives a total
outage, and it deliberately runs no jobs.

### Why detection rather than a second scheduler

Only `process-scheduled` had a backup. Adding one for the other four is the weaker answer:
GitHub's shared runners throttle a `*/5` schedule to roughly hourly, so it is a safety net rather
than a trigger — and **`auto-buy` charges a customer's card**, so it must not be fired by a backup
without deciding what a double-run does. Detection catches every cause, including unseen ones.

### Grace periods absorb the deploy gap

**Every production deploy pauses Vercel Cron for around 20 minutes** (measured: deploy 22:59Z,
config updated 23:01Z, first invocation 23:20Z). An alert that fires on every deploy is trained
away within a week, so the grace periods are deliberately generous — 30 min for a 5-minute job,
40 for a 10-minute one, 180 for the 2-hourly. Verified: a 20-minute gap is silent, 45 minutes on
a 10-minute job alerts.

`cron_runs.source` distinguishes `vercel` from `backup` (the latter sends `x-cron-secret`), which
is how you notice the primary scheduler has quietly stopped while the backup covers for it.

### The bug making it async immediately found

`requireCronAuth` was synchronous, and all five routes did
`const denied = requireCronAuth(req); if (denied) return denied;`. Making it async meant **an
unawaited Promise is truthy** — every cron would have returned it and done nothing. The compiler
caught all five call sites at once.

Awaited rather than fire-and-forget on purpose: un-awaited work is not guaranteed to run on
Vercel, and a heartbeat that sometimes fails to write reports a healthy cron as dead.

## Consent: what the product actually knows (#130, #131, 2026-08-03)

**`leads.sms_opt_in` no longer defaults to true.** It had, which meant every lead created by any
route was marked as having consented with nothing behind it:

```
leads                                209
contact_form_submissions (consent)     0
leads with sms_opt_in = false          0
```

True for every lead, never false for any. A column that is always true carries no information —
so `smsGuard` checking it enforced nothing, while the public compliance page claimed it did.

### The three states, and why unknown is NULL

| `sms_opt_in` | meaning |
|---|---|
| `true` | consent established — `consent_source` says what established it |
| `false` | **the person opted out.** `smsGuard` blocks on this |
| `NULL` | unknown |

Unknown must be NULL, never false. They are different claims, and false is the one that blocks.
Conflating them would have silently made 209 leads unmessageable.

`consent_source` is the evidence, recorded at intake by `lib/leadConsent`:
`opt_in_form` (branded page — verbatim disclosure, IP, user agent, timestamp) ·
`agent_attested` (the business asserted it at import) · `inbound_message` (they texted first) ·
`legacy_unknown` (predates this).

Find leads with no basis for contact in one indexed query:

```sql
SELECT count(*) FROM public.leads WHERE consent_source = 'legacy_unknown' OR consent_source IS NULL;
```

### Attestation is a record, not proof

For imported and hand-entered contacts the consent happened on the business's own form before the
data reached us — the platform cannot see it. Asking the business to assert it, and recording who
asserted and when, is the honest arrangement. **Inferring it from a column default was not.**

`isAttested` accepts only a literal `true`. A missing field, the string `"true"`, or `1` all read
as no — the failure to avoid is an import quietly counting as an attestation because a checkbox
serialised oddly.

The browser extension sends no attestation, so scraped contacts land as unknown. Correct, and it
needed no change to the extension.

### The public claims had to be corrected first (#131)

`hyvewyre.com/opt-in-proof.png` is the `optInWorkflowImageURLs` value on the approved TFV — the
evidence a carrier reviewer opens. It is live, serves HTML through a `next.config` rewrite, and
claimed *"Contacts cannot receive messages unless SMS consent is recorded"*, an automatic opt-out
reply that is never sent, a source-URL column that does not exist, and that agents cannot bypass
consent. `/terms` promised a confirmation SMS and said opt-outs are honoured *"within 10 business
days"* when the code applies them on receipt. `/compliance` claimed age-gating the product does
not do and called DNC scrubbing *"coming soon"* while the shipped suppression list is fully
enforced.

**Rule: fix the live artifact first, deploy, verify, then mirror it into a filing.** Never the
other way round — the 10DLC history in this repo is what happens when a submission and the live
evidence disagree.

The opt-out footer was appended in three routes and not in the shared sender, so *"every first
message carries opt-out instructions"* was false for scheduled and bulk sends. `lib/optOutFooter`
completes it rather than weakening the claim. Reminders and calendar links are excluded on
purpose: they go to someone who already has an appointment, so they are never a first contact.

## The shared verification, and what watches it (#123 gap 3, 2026-08-03)

Every agent sends toll-free under **one shared TFV** (#120). There is no published
per-verification throughput number to enforce — a TFV is a verification, not a quota. What it can
do is be **revoked**, and what revokes it is complaints.

So `lib/platformCeiling` measures two things and treats them oppositely:

| signal | behaviour | why |
|---|---|---|
| aggregate **opt-out rate** ≥ 3% | **alert only, escalated to email** | blocking would stop every well-behaved customer over a total none of them can see — a product-wide outage fired by a threshold |
| aggregate **volume** ≥ ceiling | **blocks** | a total far above normal is a loop or a compromise, and the fastest way to lose the verification for everyone |

**This is the only exposure no per-account control can see.** Fifty accounts can each sit inside
their own thresholds while the aggregate is what a carrier acts on.

### The ceiling is a runaway detector, not a business limit

`PLATFORM_DAILY_SEND_CEILING`, default **25,000/day** against real traffic of a few hundred.
Warns at 80% so it cannot be reached unannounced. Invalid or negative values fall back to the
default — a ceiling of `NaN` or `-5` would block everything.

The user-facing message quotes neither the ceiling nor the total: it is not a limit on their
account, and the numbers would only alarm.

### Caching, and why the send path needed it

`checkSmsAllowed` now makes several round trips, and gaps 2–4 added three more. Both the
platform state and the account risk tier are cached for **60 seconds**:

- the platform value is *identical for every account*
- the risk tier is computed over a **7-day** window

Neither can meaningfully change between two messages of a bulk loop. Measured across five
consecutive sends, this takes the steady state from ~1255ms to ~580ms (laptop to a remote
database — in production both sit in one region, so the real figure is far lower). Per-process,
so serverless gives each instance its own; both controls are coarse and do not need to be exact.

`clearPlatformCache()` and `clearRiskCache()` exist as testing seams — consecutive assertions
against a cache are meaningless.

### Every one of these fails OPEN

Platform ceiling, risk tier, per-number capacity, send-rate and per-contact limits all allow the
send when their lookup fails. Only the **account-status** gate fails closed. The rule: *being
unable to measure something is not evidence of abuse*, and refusing every send across every
account because one RPC is unavailable causes exactly the outage these exist to prevent.

## Send limits move with an account's behaviour (#123 gap 4, 2026-08-03)

A rolling 7-day opt-out rate multiplies every configured cap, in `lib/riskTier`:

| tier | opt-out rate | factor |
|---|---|---|
| healthy | < 3% | ×1 |
| watch | 3–5% | ×0.5 |
| poor | 5–10% | ×0.25 |
| critical | ≥ 10% | ×0.1 **+ admin alert** |

Content the detector would have blocked, sent anyway because the account turned blocking off,
shifts the tier one worse — weaker than what recipients actually did, so it adjusts rather than
decides.

### Two properties that matter more than the thresholds

**It recovers by itself.** The window is rolling, so as bad traffic ages out the tier improves
with no operator action. A throttle that needs a human to lift it is a suspension with extra
steps.

**It never reaches zero.** The worst tier still permits a tenth of normal. Cutting an account
off is a *suspension* — deliberate, reversible, accountable — and `account_status` already
exists for it. An automatic system that can silently take a paying customer to zero is one bad
threshold away from an outage nobody ordered. The worst tier throttles hard and **alerts**, and
a human decides.

`applyRiskFactor` is the only place a cap is ever scaled, and it **floors at 1**. `smsGuard`
reads `cap === 0` as *zero allowed* (deliberately — that is how an operator stops an account),
so a small cap rounding down would have silently converted a throttle into a total block.

### The volume floor is load-bearing, not a nicety

Run against production while building this, a live account reported an **80% opt-out rate** —
4 opt-outs on 5 sends, from someone testing STOP. Without `MIN_SENDS_FOR_A_VERDICT` it would
have been throttled to the bone on five messages of noise.

**Any rate over a handful of sends is not a measurement.** The same floor already existed in the
per-number health view; it now lives in `lib/riskTier` and is imported there, along with
`OPT_OUT_WATCH` and `OPT_OUT_REST` — two places judging "is this opt-out rate bad" must not be
able to drift to different answers.

### Cost

`getAccountRisk` runs on every send, as does `getNumberCapacity` (gap 2) — two extra round trips
per message on top of what the guard already did. 3.3ms at current volume. `dnc_history` had no
composite index, so `idx_dnc_history_user_added` was added; without it this degrades into a scan
of one account's entire opt-out history per message. If this ever shows up in send latency, the
tier changes slowly by construction and is the obvious thing to cache.

## Per-number capacity, and why it is not a per-number cap (#123 gap 2, 2026-08-03)

Two thresholds with different jobs, in `lib/numberCapacity`:

| | value | job |
|---|---|---|
| **soft** | 250/day | selection preference — `resolveFromNumber` avoids a number over it while another is under |
| **hard** | 60/min, 200/hr, 1200/day | circuit breaker — the number is removed from the pool entirely |

**Every hard ceiling sits above its per-account equivalent** (10/100/1000 in `smsGuard`
DEFAULT_LIMITS). That is not incidental — it is the property that guarantees no single-number
account is newly restricted. Verified by test: nothing at or below an account cap is ever
refused by a per-number ceiling.

### Why the obvious design was rejected

#123 recorded "extend `get_send_counts` to return per-number counts; block on account **or**
number limit." Wrong twice:

- `user_telnyx_numbers.phone_number` is **globally unique**, so a number belongs to one tenant
  at a time, and Growth is one number (#120). For those accounts a per-number count selects the
  *same rows* as the per-account count — a hard per-number cap is not a new dimension of
  control, only a second lower account cap. Every Growth customer would lose allowance and gain
  nothing.
- For a multi-number account, **refusing is the wrong response** when three other numbers are
  idle. Sending from a different one is.

So the value for Scale accounts is in *selection*, and the hard ceiling exists only for the case
no per-account cap can see.

### The case the account cap cannot see

A **recycled pool number**. Numbers pass between businesses, and the 30-day quarantine is
explicitly not a hard block — under pool exhaustion a number goes to a new business early,
carrying its reputation. Every account can then sit inside its own cap while the *number* takes
more than any single account would be allowed.

That is why `get_number_send_counts` has **no `user_id` predicate**.
`get_number_health_stats` does have one — correct for "how are my numbers doing", and copying
its shape here would have reproduced the exact blindness this exists to close. It is an
RLS-crossing read, so SECURITY DEFINER, `service_role` only.

### Ordering inside the resolver

Capacity is applied **before** the lock check. "Keep using this one" is a routing preference;
the ceiling is there to stop a number being damaged, so it wins.

Exhaustion returns `ok: false`, unlike rest — which the agent chose, and which therefore falls
back rather than losing a send. Falling back on a ceiling would defeat the only thing it does.
It is `retryable`, so the crons defer rather than failing the work.

### The bug a type-checker cannot see

After filtering `usable` → `withCapacity` → `pool`, the geo and primary branches at the bottom
of the function still read `usable`. Same type, still in scope, compiles clean — and would have
returned a number the function had just excluded for being at its ceiling.

**When a function narrows a collection in stages, every later reference has to move with it.**
Grep the variable name after any such refactor; the compiler will not help.

## The client threw away the server's classification (#128, 2026-08-03)

Parse a send failure with **`parseSendError(status, body)`** from `lib/sendError`. Never read
`data.error` on its own.

The four send endpoints classify every block — `reason`, `retryable`, `spamScore`,
`detectedWords`, `suggestions`, `on_dnc_list` — plus a status that already separates 402
(out of credits) from 429 (slow down) from 403 (not allowed). Across every `.tsx` in the
product, **exactly one** of those fields was ever read: `on_dnc_list`, in two places.
Everything else became `data.error` in a four-second toast, or was discarded outright in
favour of a count.

The classification work was being done and then deleted by the caller.

### A block is a state, not an event

A rate cap is still in force after a toast has faded, and a toast cannot hold a spam score with
suggested rewrites. Anything the user must *act on* belongs in a persistent banner; only genuine
one-offs stay toasts. The Composer's existing DNC banner was already the right shape and is the
pattern to match.

`SendBlockedError` carries the block through the throw-based flow in `TextsLayout` — the line
`throw new Error(data.error)` was where the structure died, one line after the payload was
parsed. Subclassing keeps every existing `catch (err) { toast.error(err.message) }` working.

### Loops must stop when the block will not clear

`BulkComposeDrawer` sends with a 100ms delay — ten a second, against a **default cap of ten a
minute**. On hitting a rate cap it used to keep going, firing dozens of requests certain to be
rejected and worsening the account's standing while reporting only "N failed". It now stops on
a rate cap, suspension or empty balance, and reports how many were never attempted.

### "Campaign started" was false

The Leads page posts to `/api/campaigns/run` **without `sendSMS`**, so that request creates a
campaign and applies tags — it sends nothing. The fixed success string said otherwise. When
`sendSMS` is set, the route returns a per-lead breakdown carrying the guard's own
`Deferred:` / `Skipped:` reasons, and the page discarded all of it.

Worth remembering when reading that route: `sendSMS` defaults to false, so most of its send
logic is unreachable from the current UI.

## Two rate limits that had never once fired (#128, 2026-08-03)

`maxMessagesPerContact` and `cooldownMinutes` were offered in Settings, saved by users, and
**blocked nothing, ever, on any account**. Both filtered on `.ilike('to_number', …)`.
`to_number` is not a column on `public.messages` — it is `to_phone`.

```
SELECT count(*) FROM public.messages WHERE to_number IS NOT NULL;
ERROR: column "to_number" does not exist
```

PostgREST returns 42703, neither call checked `error`, and the undefined results made both
conditions unreachable:

```ts
const { count } = await …ilike('to_number', …)   // undefined
if ((count || 0) >= maxPerContact)               // 0 >= 5 — never true

const { data: last } = await …                   // null
if (last) { … }                                  // never entered
```

Both now live in `lib/smsGuard`, so they run on all eight send paths rather than the one route
they used to sit on. Matching is on exact E.164 candidates — the old leading-wildcard
`%<last10>%` could not use an index under any circumstances. Added
`idx_messages_user_tophone_created`; EXPLAIN confirms an Index Only Scan.

### Merge the settings object, never replace it

`campaigns/run` did `userSettings?.spam_protection || { …defaults }`. Live rows hold **four of
eleven keys** (the column default), so taking the stored object wholesale left every advanced
limit `undefined` — and `undefined > cap` is false, so its batch and campaign caps permitted
everything for every real account.

`telnyx/send-sms` and `smsGuard` both merge (`{ ...DEFAULTS, ...(stored || {}) }`). Any new
reader of `spam_protection` must too.

### `maxCampaignMessagesPerHour` is not hourly

It compares the size of the current run to the cap and runs no query. Ten runs of 200 inside one
hour all pass. The Settings copy now says so rather than implying a rolling window.

### A deferral has to be written down

`scheduled_messages.last_deferred_reason` / `last_deferred_at`, written by `noteDeferred()`.

Every automated path already distinguished permanent from retryable and handled both correctly
— but the retryable branch only logged to the console, so a message pending because of a rate
cap or quiet hours was **indistinguishable from a cron that never ran**, the exact failure #61
took months to find. A stale `last_deferred_at` on a still-pending row is now itself the signal
that the cron has stopped.

Deliberately not `error_message`: that field accompanies `status='failed'` and means the message
is over. A routine overnight quiet-hours wait written there would render as a failure everywhere
the message is listed.

### Validation is pointless while the save reports success either way

`POST /api/settings` wrote `spam_protection` with no validation — the form's ranges are HTML
attributes, and these numbers are the send caps.

`validateSpamProtection` now bounds each key, rejects non-integers (`NaN >= cap` is false, so an
unusable cap fails **open**), and **allows 0 even though the form's `min` is 1** — `smsGuard`
documents zero as the deliberate way to stop an account sending.

That validation would have been invisible. `saveSettings` never inspected the response and
caught its own fetch error, while all three callers showed a success message unconditionally —
so the product said "saved!" for values the server had rejected, and dispatched `settingsUpdated`
so the rest of the app re-rendered with them. **When adding server-side validation, check that
the client can see a rejection at all before assuming the validation does anything.**

## A caller-supplied from-number is another tenant's property until proven otherwise (#127, 2026-08-03)

`user_telnyx_numbers.phone_number` is **globally unique** — a number belongs to exactly one
tenant at a time. So any route that takes a number off a request body and does not check it will
send from *someone else's* number, attributing the traffic and any complaint or opt-out it earns
to them.

Call **`ownsNumber(supabase, userId, phoneNumber)`** in `lib/resolveFromNumber` before trusting
one. It fails **closed**: "cannot tell whether they own this number" must not permit sending
from it. That is the opposite of `resolveFromNumber`'s lookup failure, which is retryable —
there the fallback is a number we would have chosen anyway; here it is one the caller named.

Ownership only, deliberately. An agent explicitly picking one of their own numbers has made a
deliberate choice, so this does not also refuse rested or locked numbers — that would override
the person rest exists to serve.

### The shape to watch for

```ts
let sender = body.fromNumber;      // trusted
if (!sender) sender = resolve();   // ...only reached when the body did NOT supply one
```

**A truthy body value short-circuits the resolver, so the validated path is exactly the one that
never runs.** This appeared in three routes; `telnyx/send-sms` was the only one that checked.

Worst instance was `ai-drip/start`, where the number is written to `ai_drips.from_number` and
replayed by `process-ai-drips` for **every message in the sequence** — one unchecked request
would have sent an entire drip from another tenant's number.

### Why the issue found one of three

#127 was filed against `campaigns/run`. That one turned out to be **dead** — #125 had already
replaced the `geoFrom || fromNumber || ''` chain, leaving the field parsed and unread (removed
rather than validated, since a route that geo-routes per lead never wanted a caller-named number
in the first place).

The two live ones were found by sweeping for the *pattern* instead:

```bash
grep -rn "} = body;" app/api --include='*.ts' | grep -iE "from"
grep -rn "body[?.]*\.\(from\|fromNumber\|phone_number\)" app/api --include='*.ts'
```

Same lesson as #124 and #126: **the issue describes one instance; the grep finds the class.**
Fixing only what the ticket names leaves the other instances in place — and here the one the
ticket named was the only one that no longer mattered.

## The from-number is chosen here, never by the carrier (#125, 2026-08-03)

`SendTelnyxSMSOptions.from` is **required**, and the transport refuses an empty one.

It used to be optional, and omitting it did not fail the send — the request fell back to
`messaging_profile_id` and **Telnyx picked a number from the profile pool**. Three callers
passed `from: x || undefined` with no null check, so an unresolved number became a *successful*
send from a number nobody selected: rest and lock ignored, the traffic and any complaint it
earned attributed to whichever tenant held that number, and success reported to the user.

**This is why the Rest button from #122 did nothing on those paths.** Compounded by a fallback
in `telnyx/send-sms` that overrode a declined resolve by taking the user's *oldest* active
number straight from the table — ignoring rest, lock, geo and mode alike — on the route that
`receptionist/respond`, `process-drips` and `process-ai-drips` all fetch into. Deleted.

A number is per-tenant reputation in this product. Choosing one is never something to leave to
the provider, and "no number resolved" must fail rather than fall back.

### `null` was hiding two opposite conditions

`resolveFromNumber` returned `string | null`. All nine callers branched on falsiness and
rendered some variant of *"claim a phone number first"* — so a transient database error told the
user to buy a number they already owned, and on the cron paths could mark work permanently
failed.

It now returns a discriminated result:

| reason | retryable | correct handling |
|---|---|---|
| `none_owned` | no | tell them to claim a number; fail the scheduled row |
| `lookup_failed` | yes | defer; leave the row for the next run |

`retryable` deliberately mirrors the field on `SmsGuardResult`, so the crons apply one rule to
both: **retryable means leave the row alone.** Appointment reminders no longer stamp
`reminder_status` on a transient failure — nothing re-sends a marked event, so that stamp was
permanently dropping reminders for a condition that would have cleared on its own.

### The bug class a type change introduces: `|| fallback` on a result object

Changing a return type from `string | null` to an object silently breaks every
`(await f()) || fallback`, because **an object is always truthy**. The fallback becomes dead and
the object itself flows onward.

Two sites did exactly this — `ai-drip/start` (`|| undefined`) and `process-drips` (`|| ''`) —
and **neither failed the type-check**, because both values flowed into untyped JSON request
bodies. They were found by deliberately reading the call sites the compiler did *not* flag.

When widening a return type, the sites tsc reports are the easy half. Grep for `|| ` on the
call, and read every site that stayed silent.

## Sends the counters could not see (#126, 2026-08-03)

Everything that limits or measures sending reads `public.messages`. Three defects meant parts
of the automated volume never landed there, or landed without a number attached — so the
controls built on top of it were measuring a subset and reporting it as the whole.

### Campaign-batch sends recorded nothing at all

The insert wrote `sender`, `credits_cost` and `segments`. **None of those columns exist** — the
live table has `points_cost`. Postgres rejects the entire INSERT when any one column is unknown,
and the call was never destructured, so it failed in complete silence.

Consequence: a campaign batch of any size moved `get_send_counts` by **zero**. That is the
function enforcing the per-account rate limit, so the limit could not see the bulk path it most
needed to see. The scheduled-**email** insert had the identical defect.

**Validate a column set without writing rows:**

```sql
INSERT INTO public.messages (col_a, col_b, …)
SELECT col_a, col_b, … FROM public.messages WHERE false;
```

Postgres parses and checks every column name on both sides and inserts nothing. This is the
cheapest way to prove an insert is correct against the live schema, and it is what caught the
above — TypeScript cannot, because these inserts are untyped object literals.

### `from_phone` is what makes a send attributable, and it was optional in practice

The scheduled cron and bulk scheduling both omitted it. `get_number_health_stats` computes
`opt_out_rate = opt_outs / sent` over rows that **have** a `from_phone`, so automated volume was
missing from the denominator and **inflated the opt-out rate** of whichever number sent it — on
the page that tells the agent to rest a number at 5%.

A number could be recommended for resting on a denominator missing most of its traffic.

### `message_sid` is not optional either

The delivery webhook matches on `.eq('message_sid', …)`. A row without one can never leave
`sent` — `delivered` and `failed` never arrive — and is excluded from the analytics delivery
rate. Fixed for #61 on two paths; appointment reminders and bulk scheduling still had it.

### The rule, restated

Every outbound `messages` insert needs **`from_phone`, `to_phone`, `message_sid`, `provider`,
and a checked `error`**. Missing any one of them produces a send that is real to the carrier and
invisible to this product. As of #126 all ten outbound inserts have all five; the scheduled-email
insert is the one deliberate exception (no phone, no sid).

### The claim in #126 that was wrong, and why

The issue asserted that drips, AI drips and receptionist replies write no `messages` row,
because none of those three files contains `.from('messages').insert`. **They all send by
internal `fetch` to `/api/telnyx/send-sms`, which resolves or creates a thread and then inserts
with `from_phone` set.** `ai_drips.thread_id` is NOT NULL, so that path always has a thread.

Counting routes instead of tracing where they send is the same error as "the survey that missed
one" above, and it has now produced a wrong conclusion three times in this codebase — twice
inside the work that was written to warn against it. **When a route's behaviour depends on
another route, follow the fetch.** A grep over file contents cannot see through an HTTP call.

## Outbound content moderation (#123, #124, 2026-08-03)

### The list of "send paths" was wrong for four issues running

`SendTelnyxSMSOptions.moderation` is a **required** field. Every outbound message goes through
`sendTelnyxSMS`, so a new send path cannot omit a decision without a type error, and the
function refuses a blocked decision even when a caller checks badly. Supply either
`await moderateOutbound(...)` or `exemptFromModeration('system_message' | 'account_alert')` —
bypasses are greppable rather than accidental.

That type requirement exists because centralising alone had already failed three times. Spam
scoring blocked in `telnyx/send-sms` and `campaigns/run` and nowhere else — **the same two
routes** that were the only ones covered before rate limits (#121) and from-number resolution
(#122) were centralised. Each of those was found by audit, not by anything breaking.

Worse, the enumeration itself was wrong. #40, #50, #121 and #122 each fixed **"the 8 send
paths"**, a list built by grepping for `checkSmsAllowed` and `sendTelnyxSMS`.
`follow-ups/send-calendar-link` calls neither — it hit `api.telnyx.com/v2/messages` with a raw
`fetch` — so it was invisible to the search that defined the work, and every sweep confirmed
itself complete against a list already missing an entry. It had **no DNC check**: a lead who
texted STOP still received a calendar link from it. Fixed in #124.

This is the third instance of the pattern in "The survey that missed one" above. The lesson is
the same and it keeps costing: **a survey is only as complete as the grep that built it, and
the grep is part of the finding — not a detail of how it was found.** The durable check here is

```bash
grep -rn "api.telnyx.com/v2/messages" app lib --include='*.ts'
```

Anything in that output other than `lib/telnyx.ts` and `telnyx/send-sms` is a send path outside
every gate.

Note four paths — `process-drips`, `process-ai-drips`, `receptionist/respond` and the webhook's
AI replies — reach `/api/telnyx/send-sms` by internal `fetch` and inherit its checks. Counting
routes rather than paths makes coverage look worse than it is; only tracing the fetches shows
which is which.

### What is exempt, and why exemption is the safe answer there

- **`system_message`** — the HELP reply, the START confirmation, appointment confirmations and
  reminders. Carrier-mandated fixed wording, identical for every account. The START text names
  "promotional and marketing messages" because the campaign declares them, which is exactly the
  wording the detector scores against. Blocking a HELP reply *is* the compliance failure.
- **`account_alert`** — notifications to the account owner's own phone. Not marketing, not sent
  to a lead, already DNC-exempt for the same reason.

### Policy behaviour, verified

`enabled: false` skips scoring. `blockOnHighRisk: false` scores **without** blocking — the score
is still recorded on the message row, so number health and any future risk tier have data even
for accounts that decline the block. Settings-read failure falls back to the default policy
(score, block high risk), which is fail-closed at no availability cost because scoring is pure
and local.

Threshold is 30: one high-severity word, or two medium. Measured against eight realistic agent
messages, **no false positives** — highest was 15 ("Limited time…"); "free consultation",
"free quote" and "save up to 30%" all score 0. Genuinely promotional text scores 100.

`campaigns/run` now scores the **personalized** message, not only the template. A clean template
could still produce a flagged message once lead data was substituted, and only the template was
ever checked. The policy is read once per campaign and applied per lead — `loadModerationPolicy`
and `moderateWithPolicy` are separate exports for exactly this, so a 500-lead campaign does not
make 500 identical settings queries.

### Blocks are recorded, never swallowed

A scheduled or bulk row blocked by moderation goes to `failed` / `cancelled` with the reason in
`error_message`. It is treated as **permanent** — identical text scores identically, so leaving
it pending would mean a cron rejecting it every run forever. The user sees why the message did
not go out instead of finding it silently missing.

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

**Amended 2026-07-31 (#61), and four of those five are now fixed.** The paragraph above judged
them by duplicate risk, which was the wrong axis. One of them changes behaviour when it misses:

- **stop-on-reply** pauses the drip enrollment and cancels the queued `scheduled_messages` when
  a lead answers. It is **the only drip-stop path with nothing behind it.** The opt-out path
  survives a missed lookup because `purge_lead_after_opt_out` re-resolves the lead by normalised
  phone and cascades the enrollments away. A reply that misses here leaves the drip running, so
  someone who answered keeps receiving automated messages — and nothing reports it.

Proven against live data, with the lead stored as a CSV import would store it and the inbound
arriving as Telnyx sends it:

| lookup | result |
|---|---|
| `.eq('phone', '+18887062631')` | **0 rows** |
| `find_lead_by_phone(user, '+18887062631')` | found the lead |

Four sites (stop-on-reply, opt-out `sms_opt_in=false`, opt-in `sms_opt_in=true`, and the alert
name lookup) now use the `leadId` already resolved at the top of the handler — no second lookup,
so they cannot disagree with it. Commit `7576525`.

**The fallback at line 273 was deliberately left**, and is [#111](https://github.com/tripptrap/trippdrip-v8-sprint1/issues/111):
it runs *before* the tenant is known, and `find_lead_by_phone` requires a `p_user_id`. Fixing it
needs a cross-tenant normalised lookup, which has to return the owner without leaking lead data
across tenants.

The general rule this leaves: **in the inbound webhook, resolve the lead once and pass the id.**
Any second lookup by `from` is a lookup that can disagree with the first.

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

## `/api/email/service` was an open phishing relay (audit 2026-08-03, `a9a53ad`)

The gate was `if (!user && (!apiKey || apiKey !== systemApiKey))`. Read it carefully: a
session **or** a key. Middleware does not run on `/api/*`, so that line was the whole
door, and any Supabase session — including the unpaid signups anyone can create — could
POST:

```json
{ "type": "password_reset", "to": "<anyone>", "data": { "resetUrl": "<attacker>" } }
```

The mail then left `support@hyvewyre.com` with SPF and DKIM passing and full HyveWyre
branding. Credential phishing of our own customers, from our own domain, unthrottled, to
any recipient — and a fast way to get that mailbox blacklisted, which takes every
transactional and alerting email down with it.

All four callers are server-side and already sent the key (`lib/serviceEmail.ts`,
`admin/users/action` ×3), so the session branch had no legitimate user at all. It is gone;
the key is the only way in, compared with `secureCompare` rather than `!==`.

### The probe that proves an auth gate without exercising what it guards

An unknown `type` hits the switch's `default:` and returns 400 — reached only *after* the
auth check, and *before* anything is sent. So posting `type: "__probe_no_send__"` reads
the gate directly:

| response | meaning |
|---|---|
| `400 Unknown email type` | auth **passed** |
| `401 Unauthorized` | auth **blocked** |

Live production returned 400 from a signed-in browser before the fix, and 401 after —
proof both ways, and no email ever sent. Look for an equivalent cheap post-auth 400 before
testing any other gate the expensive way.

### `service_emails` had zero rows, and it was not because sending failed

Both inserts were wrapped in `if (user)` with the id taken from the *caller's session* — a
thing that only exists when a browser hits the route, i.e. never for the four real callers,
which are all server-side. So the table logged nothing, ever, while email worked fine.
`user_id` is now resolved from the **recipient** (nullable, which the column allows), which
is who a service email is actually about.

### `SYSTEM_API_KEY` has a trailing newline in Vercel — and it is harmless

`vercel env pull` writes it escaped as `\n`, which is what makes it visible at all. It is
**not** a live bug: undici strips a trailing newline from a header value before sending, so
the comparison always matched. Worth knowing for two reasons — a hand-rolled `curl` test
*will* fail against it and look like a broken gate (this cost a detour), and the same
newline in `SENDGRID_API_KEY` genuinely did break SMTP AUTH in #101, because that one is
sent as a password rather than a header. Both sides now `.trim()`.

`lib/serviceEmail.ts` also refuses loudly when the key is unset instead of quietly dropping
the header: with the session branch gone, a missing key is a total silent outage of every
transactional email.

**`/api/email/send` is a different route and is fine** — it sends through the *user's own*
SMTP credentials, from their own domain, costs a credit, and is correctly session-gated.
Do not "fix" it to match.

---

## `/compliance` claimed four controls that do not exist (`576add3`, 2026-08-03)

The public compliance page advertised **multi-factor authentication, role-based permissions,
third-party penetration testing and 24/7 monitoring**. None exist: grepping for MFA returns
nothing at all, an account is a single owner with no roles, no third party has assessed this
system, and there is no staffed monitoring. This is the page a prospect or a regulator
actually relies on, so it was the worst place to be wrong.

It now carries a **"What we do not yet have"** panel stating all four plainly. Prefer that
shape to silent deletion — a missing claim reads as an oversight, a stated absence reads as
a decision, and it stops the claim being quietly re-added later.

### Three of the corrections made the page *stronger*, not weaker

Worth knowing, because the instinct when auditing marketing copy is to weaken everything:

| claim | what was actually true |
|---|---|
| "8 AM – 9 PM recipient's local time" | default is **08:00–20:00**, an hour *tighter* than TCPA, configurable, and for a state spanning zones a send is held if it is quiet hours in **any** of them (#50) |
| "Proper 10DLC registration" | registration is a **gate** — all three number-acquisition routes refuse without it |
| "Consent Tracking: tag leads with consent status" | source *and* timestamp per contact, and no-record is marked as such rather than assumed consenting (#130) |

The page had been underselling real controls while overselling absent ones.

### The claim that had to be narrowed, and why it was not just fixed

`withOptOutFooterIfFirst` is applied on **bulk and scheduled sends only** — not on
`telnyx/send-sms`, `sms/send`, `campaigns/run`, or the drip crons. So whether a first
contact carries opt-out instructions depends on which button the user pressed, which is not
a distinction CTIA makes. The page now says bulk-and-scheduled rather than claiming
universal coverage, and the gap is **#133** (fix: move it into `lib/smsGuard.ts`, which all
ten send paths already share, rather than a sixth copy per call site).

**Rule this leaves behind:** when a compliance claim outruns the code, narrow the claim
*and* file the gap in the same change. Narrowing alone quietly lowers the bar; filing alone
leaves a false public statement live in the meantime.

### The email API key was stored in plaintext in a column called `_encrypted`

`app/api/user/settings/route.ts` wrote `email_api_key_encrypted = preferences.emailApiKey`
under the comment *"In production, encrypt this before storing"* — which production then
read as a promise already kept. Now encrypted. No migration: that column had exactly one
reference in the whole codebase (the write), no reader, and 0 rows with a value. A future
reader must go through `safeDecrypt`, which passes through anything we did not encrypt.

Checking that claim is the *only* reason it was found — the page asserted stored credentials
were encrypted, and verifying the sentence found the bug. Auditing public claims against the
code is a bug-finding technique, not just a copy exercise.

**Public pages never enter dark mode** (#134) — `<html>` carries no `dark` class, so every
`dark:` variant in `app/(public)` is inert. Pre-existing, whole route group, not just this page.

---

## The resolver picked the one number that could not deliver (`ac9cbbd`, 2026-08-03)

`resolveFromNumber` knew about type, primary, lock, rest and capacity — every property
except the one carriers actually gate on. `user_telnyx_numbers` had no registration column
at all, so it could not have known. On the live account it therefore chose the single number
that cannot deliver:

| number | type | primary | registration |
|---|---|---|---|
| `+18134972176` | local | **yes** | assigned to no campaign |
| `+18135187997` | local | no | CAAP953, MNO_PROVISIONED |
| `+18887062631` | tollfree | no | TFV **Verified** |

It prefers local over toll-free for new conversations (#129), then takes the primary —
landing on the unregistered local while two working numbers sat unused.

**This corrects CLAUDE.md**, which said "0 numbers are assigned". One local number *is*
assigned and the toll-free *is* verified. #105 is about `+18134972176` specifically, not
about messaging being blocked account-wide.

### Unknown is a third state, and collapsing it would have caused an outage

`registration_synced_at IS NULL` means nobody has asked Telnyx — **not** "unregistered".
Treating unknown as unregistered would have blocked every send on every account the moment
this shipped, before the first sync ran.

    registered    known good      always preferred
    unknown       never synced    usable — refusing on data we never collected
                                  punishes the user for our own gap
    unregistered  known bad       refused, new `none_registered` reason

Same shape as any cache-backed gate: *absence of a record is not a negative record.*

### A thread pinned to an unregistered number now re-resolves

#129 pins a conversation to the number it started on. That pin is now conditional on the
number being able to deliver: continuity is a benefit of messages **arriving** from a
familiar number, and keeping the pin would trade a visible number change for silent
non-delivery.

### Telnyx returns verification requests OLDEST first

Not newest first. The first cut of `syncNumberRegistration` reversed the list on the
opposite assumption, so the oldest verdict won and this account's currently-**Verified**
toll-free was written as `rejected` — which would have blocked a number that works. The
three records are Rejected (Dec 20), Rejected (Dec 26), Verified (Jan 10).

Now sorted by `updatedAt`/`createdAt` explicitly, which is correct under either ordering.
**Found only by running the sync and reading the result** — the code type-checked, ran
without error, and produced a confident wrong answer.

### Where the state comes from

`lib/numberRegistration.ts` owns the rule (`isRegistered`: a long code needs a campaign, a
toll-free needs verification) and the reconcile. Telnyx is the source of truth; the three
columns are a cache. The sync runs from `GET /api/telnyx/numbers` when older than 6 hours —
that route already calls Telnyx for the toll-free auto-release, so it is not a new class of
round trip, and registration only matters when someone is looking at or about to use their
numbers. `can_send` and `registration_gap` are computed server-side so the phone-numbers
page cannot drift from what the resolver does.

---

## Credits and document upload (audit, 2026-08-03)

Four separate faults, all in one call chain, each hiding the next.

### 1. Read-then-write lost most deductions — measured, not theorised

`spendPoints` did SELECT credits, subtract in JavaScript, UPDATE the result.
25 concurrent spends of 1 point, run against the live database:

| implementation | balance dropped by | lost |
|---|---|---|
| old read-then-write | **2** | 23 of 25 (**92%**) |
| `deduct_credits` RPC | 25 | 0 |

Bulk campaigns fire many sends at once, which is exactly the shape that loses the most — the
busier the account, the more free credits it got.

`deduct_credits` already did it correctly and **nothing called it**: one statement,
`UPDATE ... WHERE credits >= amount RETURNING`, so the guard cannot be separated from the
write. It raises `check_violation`, confirmed as SQLSTATE **23514** by calling it. Same for
`add_credits`. Both go through the service-role client, because `cd21589` revoked EXECUTE on
every SECURITY DEFINER function from anon and authenticated.

### 2. Document upload had been 402ing for everyone

`app/api/leads/upload-document` imported the **client-side** points module, whose own first
line says to use `pointsSupabaseServer` in API routes. That module builds a browser Supabase
client; in a route handler it has no cookies, so `auth.getUser()` returned null and every
upload answered `402 {"error":"Not authenticated"}` — CSV, XLSX, JSON, DOCX, TXT, all of it.
CSV is the primary documented import path for this product.

That is also why the broken PDF parser below was never noticed: nothing reached it.

### 3. Refunds reported success and did nothing

`addPoints` had the same read-then-write shape **and** issued its UPDATE on the caller's
client. `close_anon_lead_and_user_grants` had revoked UPDATE on `users` from `authenticated`
except four profile columns, and `credits` is deliberately not one of them — so the write
failed outright while the route said "Your points have been refunded".

Nothing checked the error. Same failure class as the STOP opt-outs that logged success for
months: **supabase-js returns `{ error }`, it does not throw.**

### 4. PDF upload had never worked, for three stacked reasons

`parsePDF` was written against pdf-parse **v1** (module itself callable) while package.json
pinned `^2.4.5`, which exports named classes and no default. `(pdfParse as any).default ||
pdfParse` fell through to the module namespace object, so calling it threw. **A fallback that
cannot work is worse than no fallback** — it moves the error away from the mistake.

Then, deployed, two more:

    DOMMatrix is not defined
    Cannot find module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'

pdf-parse v2 wraps **pdfjs-dist, a browser library**. The audit said this route imports a
browser library server-side; I checked the imports, saw Node-capable packages and
`runtime = "nodejs"`, and dismissed it. It was right and I was wrong — the browser dependency
is transitive.

Fixes: shim `DOMMatrix`/`Path2D`/`ImageData` (constructors only — text extraction does no
geometry), and name the worker in `outputFileTracingIncludes`, since Vercel's tracing only
ships what it can see statically and a runtime path import is invisible to it.

### The rule this leaves behind

**Local Node proved nothing here.** Local Node has no `DOMMatrix` either and parsed the same
PDF fine — the runtimes take different pdfjs code paths. Three deploys were spent guessing.

What actually cracked it was returning the parse reason to the caller instead of a generic
"Could not read that PDF file". Each deploy then named its own next error. For any package
that resolves files or globals at runtime, **the deployed endpoint is the only test that
counts, and it needs to be able to tell you what it hit.**

---

## Confirmed by real-world test — do not re-derive these from API fields

Things that were checked against actual handsets and actual behaviour. An API field that
seems to contradict one of these does **not** override it. Add to this list whenever
something is verified in the physical world; that is the evidence that outranks everything
else here.

| what | result | when |
|---|---|---|
| SMS delivery to an **AT&T** handset from this account's long codes | **works** | 2026-08-04, user-verified with a real AT&T subscriber |

### Toll-free numbers are NOT limited to 5 per verification request

There is **no documented maximum** per request. From Telnyx's own
[Toll Free Verification Request Guide](https://support.telnyx.com/en/articles/10729979-toll-free-verification-request-guide):

> "If you are submitting more than 5 Toll Free Numbers in a single Verification Request then
> please include a detailed valid explanation for why multiple numbers are needed."

So **5 is the justification threshold, not a ceiling.** The rejection this account received —
*"Additional Information Requested - Justification for more than 5 numbers per business"* — is
listed by Telnyx as **eligible for resubmission once justification is provided**. It was never
a refusal; it was a request for an explanation that was not given.

I previously stated the opposite in conversation — *"you can't scale on demand, 5 numbers at
a time, and Telnyx has to approve each new batch"* — reasoning from the rejection text rather
than checking the rule. It never reached a file, but it did shape planning for a while, which
is why it is recorded here.

**What this changes:** the shared-pool model scales further than assumed. The justification a
platform can give is also the strongest kind — one number per end customer, each serving a
distinct business, not one business accumulating numbers.

**What is still true:** every request is a carrier review cycle with a real wait, so it is not
self-service, and **an approved request must never be resubmitted** — Telnyx confirmed that
unverifies the numbers on it until re-approved. New numbers go on a NEW request.

### `attNumberMappingStatus: FAILED` does not mean AT&T is blocked

Both long codes report `attNumberMappingStatus: FAILED` while `assignmentStatus` is
`ASSIGNED`:

    +18134972176   ASSIGNED   att FAILED   tmobile ADDED   other ADDED
    +18135187997   ASSIGNED   att FAILED   tmobile ADDED   other ADDED

**Messages to AT&T handsets go through anyway.** Tested. `failureReasons` is null on both.

I shipped a UI warning saying messages to AT&T subscribers "may be filtered", reasoning
from the field name and from AT&T's subscriber share. That was wrong, and wrong in the
expensive direction — it would have sent someone chasing a carrier problem that does not
exist, and it contradicted a test that had already been run.

The three mapping columns are still recorded (`att_mapping_status` and friends) because
they are real data. Their *meaning* is not established. **If deliverability is in question,
send to a handset on that carrier — do not infer it from this field.**

### The rule

A status field is a claim about a system's internal state, not an observation of what
happens to a message. When the two are available, the observation wins and the field gets
re-interpreted, never the other way round. Anything verified against a real handset belongs
in the table above so it is not quietly re-litigated by the next person reading an API
response — this section exists because that had already happened once.

---

## 10DLC mock mode: what it proves, and what it does not (2026-08-04)

**Status: waiting on Telnyx support.** Question drafted in
[`docs/TELNYX_QUESTION_TCR_TESTING.md`](TELNYX_QUESTION_TCR_TESTING.md), **not sent**.

Enabled by `TELNYX_10DLC_MOCK=true`, read from the environment and never from the request
body — a caller-supplied mock flag would let someone mark themselves registered without
facing a carrier. Set on **Preview only**. `is_mock` is recorded on the row.

### Mock is a sandbox record, not the absence of a record

It creates a real object in Telnyx's system and stops before TCR and the carriers. It shows
up in listings and occupies account state permanently.

| | mock | the real one |
|---|---|---|
| brand `identityStatus` | **VERIFIED instantly**, no identity check | VERIFIED after review |
| `tcrCampaignId` | the internal UUID echoed back | `CAAP953` |
| `campaignStatus` | **stuck at `TCR_PENDING`** | `MNO_PROVISIONED` |
| `isTMobileRegistered` | false | true |

**It is genuinely free.** Telnyx balance was $49.54 before and $49.54 after — checked, not
assumed.

### What the test established

Ran the real onboarding field set through `createBrand` + `createCampaign` with `mock: true`
(a fictional insurance LLC in Tampa). Both succeeded. So **the payload is correct** — field
shapes, required values, and the sub-usecase counts (`MIXED` needs 2–5) are all accepted.
That was the unknown, and it is answered.

### What it does NOT establish — do not claim otherwise

The brand auto-VERIFIED with no identity check and the campaign never leaves `TCR_PENDING`.
So mock exercises the **submission half only**. Untested: brand verification against real
business data, campaign approval, carrier provisioning, number assignment, sending.

*"Registration works"* means *"a registration can be submitted"*. Whether a given customer's
would be **approved** is still unknown, and the only way to find out today is a real
submission with a real EIN and the $15 fee.

**One safety property does fall out of it:** `isCampaignUsable('TCR_PENDING')` is false, so a
mock registration can never unlock a real number. Verified.

### Mock artifacts cannot be deleted

    DELETE /10dlc/brand/{id}     -> 500
    DELETE /10dlc/campaign/{id}  -> 404

Three mock brands now sit on the production Telnyx account and every test run adds another
(#118). If Telnyx confirms they are permanent, testing wants its own Telnyx account.

### The preview environment is deliberately half-finished

Preview holds 4 environment variables against production's 25. It needs
`SUPABASE_SERVICE_ROLE_KEY` and `TELNYX_API_KEY` to run, and **those were not copied on
purpose**: every branch deployment would then read and write production data with
service-role access, on URLs that are public by default, while #29 says those secrets may
already be exposed. That is the account owner's call, not a default.

Building the preview did surface a real bug, now fixed (`71c5c0e`): two routes constructed
`new OpenAI()` at module scope, which throws without a key during Next's build-time
page-data collection — so the app could not build in **any** environment lacking
`OPENAI_API_KEY`, including a fresh clone.

### Sole proprietor was withdrawn in the same pass (#119) — to be rebuilt, not abandoned

Telnyx requires an SMS PIN step for sole props that nothing here implements, so choosing it
submitted a registration that reached Telnyx and stopped, with no error and no number.
Removed from both pickers, refused by the API, and the EIN exemption it left in
`checkNumberEligibility` was closed — that exemption would have let such a row pass the gate
and receive a local number it could never use.

**#119 stays open on purpose.** This is a withdrawal until it can be built properly, not a
decision against the segment. Three things are now known that were not when it was filed:

- Telnyx prices **Sole Proprietor at $2/month**, between Growth's `LOW_VOLUME` ($1.50) and
  Scale's `MIXED` ($10). It fits the Growth tier's economics almost exactly.
- `SOLE_PROPRIETOR` **is a valid use case** — confirmed against the live `/10dlc/enum/usecase`.
  Nothing blocks it on Telnyx's side.
- **The work is the PIN flow, not the dropdown** — and it is smaller than it first looked.
  Verification is an **SMS OTP, not a phone call**: a 6-digit PIN to the mobile number on the
  brand. Telnyx exposes **three API endpoints** for it — trigger the SMS, check delivery
  status, verify the PIN — so it is fully automatable. The `10dlcquestions@telnyx.com` email
  route is only the manual fallback.

  **Resend is supported:** *"If the OTP expires, simply call the trigger endpoint again to send
  a new PIN."* An earlier note here said that needed confirming from Telnyx; it did not, it is
  documented.

  **But expiry is not free:** *"If the PIN is not returned within 24 hours, it will expire, and
  you will need to restart the brand creation process."* So the UI has to make the window and
  the resend control obvious rather than letting someone discover the cost.

  Build: pending OTP state on `user_10dlc_registrations`, trigger after brand creation, a PIN
  field with a visible countdown and resend, expiry handling that restarts brand creation and
  says so, then re-add the option and drop the API refusal in `register/route.ts`.
  Source: [Telnyx sole-proprietor guide](https://support.telnyx.com/en/articles/13545282-guide-to-sole-proprietor-10dlc-brand-and-campaign-registration).

---

## Delivery outcomes were never recorded — `message.finalized` (#135, `bebbef9`)

The Telnyx webhook allowlisted `message.sent` / `message.delivered` / `message.failed`.
**Telnyx API v2 sends `message.finalized` for the terminal state**, and that string appeared
nowhere in the codebase. Every terminal outcome was dropped, and the endpoint answered
`200 {"received":true}` while doing so.

Verified by asking Telnyx about message ids this database has as `sent`:

    40319fb6-8aac-4205-8…   telnyx: delivered   ours: sent
    40319fb6-8881-4666-b…   telnyx: delivered   ours: sent
    40319fb6-8c4b-4cd8-a…   telnyx: delivered   ours: sent

**The messages were arriving the whole time.** 62 rows sat at `sent`, none had ever reached
`delivered` or `failed`, and the zero-failures figure has the same cause — a failure arrives
as `message.finalized` too.

Status now comes from **`payload.to[0].status`**, which is authoritative and present on every
delivery event, rather than being inferred from the event name. The event name only ever
worked for events Telnyx does not send.

`delivery_unconfirmed` maps to `sent` deliberately: **`messages_status_check` constrains that
column to `draft|queued|sent|delivered|failed|read`**, and supabase-js returns `{ error }`
rather than throwing — so writing a value outside the set would have silently left the row
untouched, which is the exact class of bug being fixed. The distinction is kept in
`error_message`.

This also retires the AT&T worry from a different direction: messages deliver.

## The cron watchdog cries wolf, and its own reading is unreliable

**The crons are healthy.** `cron_runs` holds 206 rows across all five Vercel crons plus the
GitHub Actions heartbeat, every one on cadence. Nothing is overdue. Vercel is on Pro, the
schedules are registered, `CRON_SECRET` is correct.

**"cron_runs has zero rows" was a reading error of mine** — a fragile JSON parse of the CLI
output, the same one that reported `number_pool` as empty when it held three rows. When
checking a table is empty, print `count(*)` and read it, rather than parsing rows out of the
CLI envelope.

Six false emails went out overnight. `find_overdue_crons()` returned `last_ran_at: null` for
jobs that plainly had rows — the 03:50:26Z alert said `auto-buy` had **never** run while
`cron_runs` held an `auto-buy` row from 03:00:36Z, 50 minutes earlier and inside its
90-minute grace.

**Cause undetermined.** Not reproducible: the same RPC through PostgREST with the same key
returns `[]` every time, direct SQL agrees, the table owner has `BYPASSRLS`, RLS is enabled
but not forced, there is one function definition and no replica.

So the alert now **confirms against `cron_runs` before firing** and logs both values when they
disagree. A single read caught lying is not grounds to wake someone at 4am, and a watchdog
that cries wolf trains you to ignore the channel it shares with real outages — the failure
#117 exists to prevent. The disagreement log is the diagnostic for the next occurrence.

---

## 10DLC economics and lifecycle — from Telnyx support, 2026-08-04

Straight from Telnyx. This supersedes anything inferred elsewhere.

### The $15 is per campaign per three months, not per submission

> "The charge for 15 dollars is a three month charge in advance, for the creation of the
> campaign. No matter how many times the campaign is rejected and edited, there are no
> further charges for 3 months. As long as we are working on the same campaign. After 3
> months, the campaign will be billed monthly."

**I previously said the opposite** — that each resubmission after a rejection costs another
$15, and that this account's eight submissions implied ~$120. That was wrong. Rejections and
edits of the *same* campaign are free within the three-month window. Cost scales with
**campaigns**, not attempts, so the eight-attempt history is far cheaper than I implied and
iterating on a rejected campaign is not something to avoid on cost grounds.

Unit economics: **$15 per customer for the first three months, then monthly per campaign.**
At 100–1000 agents that is a recurring per-seat cost that has to be in the pricing model.

### Mock mode tests the API and nothing else — confirmed

> "The mock brand is to test the API. There is no mock vetting. Vetting is done by a third
> party and they have no sandbox."

Matches what was measured: the mock brand returns VERIFIED with no identity check and the
mock campaign never leaves TCR_PENDING. **There is no way to test whether a real customer
would be approved.** Not a gap in our tooling — the sandbox does not exist.

### ⚠️ Dormancy, and a $500+ carrier penalty

> "If a campaign is inactive for I believe 45 days we place it in dormant status. There is a
> wireless carrier fine/penalty if a campaign is verified and inactive on their networks. So
> we place the campaign into dormant status to avoid $500 plus fees."

**This is a live financial exposure in the per-agent model and nothing in the product handles
it.** Every customer gets their own campaign. Customers churn, pause, or simply stop sending.
A verified campaign left idle attracts a carrier penalty measured in hundreds of dollars, and
Telnyx's dormancy mechanism is what normally absorbs it.

Nothing here tracks per-campaign last-send, notices a campaign going quiet, or deactivates on
churn. At 100–1000 agents with ordinary churn that is a recurring bill nobody is watching.
Filed as its own issue.

### Deleting a brand or campaign requires deactivating it first

> "You have to deactivate brand or campaign before you can delete."

Explains the failures recorded under #118 (`DELETE` → 500 on the brand, 404 on the campaign):
the delete was attempted on active objects.

**Do not guess the deactivation payload against the live account.** A `PUT /10dlc/campaign/{id}`
with `{"campaignStatus":"DEACTIVATED"}` returned 200 but moved the campaign from `TCR_FAILED`
to `TCR_PENDING` — that is an edit-and-resubmit, not a deactivation. Harmless on a mock
campaign; it would not have been on a real one. Get the correct call from Telnyx.

---

## The Receptionist had never sent a message (2026-08-04)

Found by the account owner texting his own number. Six defects between "inbound arrives" and
"AI replies", none visible from reading the code.

### There are not two AIs — there is one

`app/api/receptionist/respond` is the **only** inbound AI endpoint. "Flow AI" and
"Receptionist" are the same call with `flowContext` either attached or null; the persona
always comes from `receptionist_settings`. A lead in a flow is the Receptionist wearing an
extra prompt block.

### What was broken

| # | defect | effect |
|---|---|---|
| 1 | posted the text as `body:`, send-sms reads `message:` | **every** reply 400'd — `receptionist_logs` had 0 rows, ever |
| 2 | lead lookup selected `name`, a column `leads` does not have | PostgREST 42703, error unchecked, `lead` always null → everyone was a "new contact" and no flow could run |
| 3 | send-sms wraps `checkSmsAllowed` in `if (!internalCaller)` | Receptionist bypassed DNC, opt-out, suspension, quiet hours |
| 4 | credits deducted **before** the send | every failed attempt still charged |
| 5 | `isAutomated` accepted and discarded | AI messages indistinguishable from typed ones |
| 6 | `deduct_credits` writes no ledger row | the charge vanished (#137) |

**#2 is why the client-routing fix earlier the same day was unreachable** — the whole
`if (lead)` branch was dead code. The same file already warned about that column 300 lines
below; only the other copy had been fixed.

**#1 and #3 had to ship together.** Fixing the send alone would have switched on an AI that
auto-replies to opted-out numbers, from suspended accounts, at 3am.

### A reply is not unsolicited outbound

Wiring the guard in immediately caused a regression: the owner texted twice in 18 minutes and
the second was swallowed by the 30-minute per-contact cooldown. `GuardOptions.isReply` now
skips **quiet hours** and the **per-contact cooldown** — both exist to restrain unsolicited
outbound, and someone who texts you at 11pm has invited an answer. Everything protecting the
recipient still applies: DNC, opt-out, suspension, and the per-account rate limits, which are
what stop a reply loop running away. Only the Receptionist sets it.

### Two clocks, and they are not the same clock

    Quiet Hours (Settings)          may an automated message send AT ALL
    Receptionist business hours     real answer, or the after-hours text

Both fired correctly and the combination reads as a bug. Outside business hours the
Receptionist **sends** the after-hours message; it does not stay silent.

**As configured on the test account (2026-08-04) both windows are 08:00-20:00 America/New_York**,
which makes them impossible to tell apart from an observed "no reply" — they fail at the same
instant. Do not read the times off this doc; they are per-account rows
(`users.quiet_hours_*` and `receptionist_settings.business_hours_*`).

Addressed in #140, and worth being precise about what was and was not wrong. The **column
defaults are fine and deliberately different** — quiet 08:00-20:00, business 09:00-17:00, so out
of the box business hours sit inside a wider quiet window. The collision is one account's own
configuration. The quiet-hours values matching across all four `tripp*` accounts is just the
default showing through: nothing has ever edited them, because until now no screen explained what
editing them would do.

So the fix was naming, not behaviour:

- Every column on both clocks now carries a `COMMENT` saying which of the two jobs it does.
- The Settings copy was actively wrong. "Prevent automated messages from being sent outside of
  specified hours" reads as covering auto-replies, and quiet hours does not touch them
  (`isReply`). It now says what it governs and points at the other setting.
- The Receptionist's Business Hours card explains that outside those hours the contact still
  gets a reply, and warns when the two windows are identical. Verified rendering against the live
  account.

**`business_days` is ISO — 1=Monday … 7=Sunday — and that is now enforced**, not merely
conventional. It was an untyped `integer[]` with no constraint and no comment, so whether it
meant ISO or Postgres DOW (0=Sunday) was undeterminable from the database. `{1,2,3,4,5}` is
Mon-Fri under *both* readings, which is exactly the coincidence that hides the ambiguity until
someone stores a `0` — which matches no day and would silently close that day for ever.
`receptionist_settings_business_days_iso` rejects it. Duplicates are deliberately not checked:
that needs a subquery, and `CHECK` cannot contain one (`0A000`).

Quiet hours does **not** protect the after-hours message. `isReply: true` disarms the
quiet-hours branch (`lib/smsGuard.ts:396`) and `send-sms` skips its own guard for internal
callers (`send-sms/route.ts:381`), so a contact texting at 3am gets an automated "we're closed".

**It is now said once per closed period, not once per text** (#138, fixed). Three real sends on
2026-08-04 at 18:00, 18:30 and 19:05 ET were three separate answers to three separate messages;
under the fix only the first goes out. `closedPeriodStart()` in
`lib/receptionist/businessHours.ts` returns the instant the current closed stretch began, and
the route suppresses if a `receptionist_logs` row with `response_type = 'after_hours'` already
exists for that thread since then. Keyed on logs rather than a new column, so it reflects what
was actually **sent** — a reply that failed to send does not silence the next attempt.

A boundary, not a cooldown, deliberately: a fixed cooldown sends a second "we're closed" in the
middle of the same night, and re-arming only after the business has genuinely reopened is what
"once per closed period" means. It walks backwards to find the previous open day, so a Sunday
text on a weekdays-only schedule reaches past Saturday to Friday's close. Verified across both
DST transitions.

**Gating it on quiet hours was considered and rejected.** On this account both windows are
08:00–20:00 (see above) — identical — so "after hours" and "quiet hours" are the same span, and
gating one on the other would mean the after-hours message *never sends at all*. It would look
like the feature was removed. It is also a direct answer to a message the contact just sent, not
unsolicited outbound, which is the distinction `isReply` exists to draw. The repetition was the
real harm and that is what was fixed.

Verified by executing the real `checkSmsAllowed` against the live settings at 20:11 ET:
`isReply: true` → allowed; `isReply: false` → `quiet_hours`. It is the only thing standing
between that send and a block.

**The reply claim is checked before the business-hours branch**, so the after-hours message is
covered by the one-reply-per-burst lock too — a burst of three texts while closed produces one
canned reply, not three. That makes the lock testable outside business hours, when no model
runs at all.

### After-hours and greeting are free, by the owner's decision

Neither calls the model, so both already cost 0 AI points — but each still took 1 SMS credit,
so an automatic "we're closed" nobody wrote appeared on the statement.

The greeting was not free *or* canned: `greeting_message` was passed to the model as a style
hint and rewritten, so it cost 2 points **and the configured greeting was not what anyone
received**. It is now sent verbatim.

The signal is `pointsUsed === 0` (no model ran), not a list of response types that would
drift, and it is honoured only for a verified internal caller — otherwise a browser session
could send unlimited free SMS.

### Settings can be configured on the wrong account and fail silently

`receptionist_settings` existed for `trippbrowning620@gmail.com` while every lead, thread and
number belongs to `tripped620@gmail.com`. `GET /api/receptionist/settings` returns **defaults**
when no row exists, so the page shows `enabled: false` rather than "no configuration here" —
indistinguishable from a deliberate off.

### People text in bursts, and every message got its own reply

Observed live: the contact sent "Yes please" at 23:52:33 and "Why not?" at 23:52:36, and got
**two replies in the same second** plus two `follow_ups` rows for one request. Two inbound
webhooks, two invocations of this route, neither aware of the other.

The 10-20s human-pacing delay makes this *more* likely, not less — it widens the window in
which a second message lands while the first is still being answered.

Two changes, and both are needed:

**The delay now runs before the history read, not after generation.** Whatever arrives during
the pause is already in the conversation the model sees, so one reply answers the whole burst.

**`threads.ai_reply_lock_until` is claimed atomically.** Checking "has anything been sent
since?" and then sending is a race — those two replies landed in the *same second*, so a read
check would have let both through. A conditional `UPDATE` is not a race: Postgres serialises
the writers on the row lock, the loser re-evaluates its `WHERE` against the winner's committed
row and matches zero rows.

Verified against the live DB — two concurrent claims, one wins; a third mid-flight stands down;
a claim left in the past by a crashed invocation is re-claimable.

**"Free" is the sentinel `-infinity`, never NULL.** The nullable version needs
`(x IS NULL OR x < now())`, which through supabase-js is `.or('...is.null,...lt.<ts>')` — and
PostgREST rejects that with:

    column threads.ai_reply_lock_until does not exist

The column exists. `.select()`, `.update()`, `.is()` and `.lt()` on it all work; only the
`or()` form breaks, because PostgREST re-parses dotted names inside a logical group. The error
names the column, so it reads as a missing-column problem and sends you to the schema. It is a
filter-syntax problem. **A failing claim fails open** — every claim erroring means every reply
either duplicates or stands down forever, depending on which way the code reads the error.

### A new column is invisible to PostgREST until the cache reloads

Same session, before the above: the column was confirmed present in `information_schema` and
supabase-js still reported *"column does not exist"*. PostgREST caches the schema. Applying a
migration is not enough:

```sql
NOTIFY pgrst, 'reload schema';
```

It is not instant either — roughly 10s here. So the sequence "apply migration, immediately test
through the app, conclude the migration failed" produces a false negative, and every migration
that adds a column should end with that NOTIFY.

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

## Production logs are a historical record, not current state (runtime audit, 2026-08-06)

The Vercel, Supabase and Stripe MCP connections make it possible, for the first time, to
audit what production is *actually doing* rather than what the code implies it does. The
first pass found real bugs — and three false ones, all from the same mistake.

**`get_runtime_errors` returns a 7-day window. A cluster in it may already be fixed.**
Three issues were filed off error clusters and closed within the hour:

| Filed | Error window | Fixed by | Gap |
|---|---|---|---|
| Upload refund fails, "user was charged for nothing" | 2026-08-03 23:50:41Z | `3c5df8a`, 23:53Z | **3 minutes** |
| `user_telnyx_numbers` RLS violation on pool purchase | 2026-07-31 04:27Z | now uses `createServiceRoleClient()` | — |
| Telnyx "Failed to read asymmetric key" x26 | 2026-07-31 04:57–05:40Z | #108, same day | — |

The last one is the sharpest: that exact openssl error text is already documented in this
file (see "Inbound was dead for six months"), with its root cause and its fix. It was
re-filed anyway, because the log was read and this file was not.

**Before filing anything found in a log: check the error's last-seen timestamp against
`git log` for the relevant file, and grep this document for the error text.** Verify the
behaviour is still broken *now* — for the Telnyx one, the definitive check took a single
query (28 inbound messages in 7 days, most recent that afternoon; inbound is alive).

### Confirmed live, 2026-08-06

- **All six crons run.** `cron_runs`: process-scheduled 833, process-drips 415,
  process-ai-drips 416, auto-buy 69, send-appointment-reminders 35, check-idle-campaigns 13.
  `SELECT * FROM find_overdue_crons()` returns zero rows. Roughly 700 alert lines claiming
  `auto-buy: has never run; send-appointment-reminders: has never run` were true only at
  2026-08-03 21:45 — before those jobs' first run at 22:01 — and the repeat-suppression path
  then echoed the original wording for two more days (#182). **Do not read a `🔁 still
  failing` alert as current state; query `cron_runs`.**
- **`scheduled_messages_status_check` permits `sending`.** The 282 `23514` failures on the
  #61 drip test are from before that constraint was widened, and the queue is now clean:
  0 stuck in `sending`, 0 failed.
- **Zero DNC violations.** No outbound message exists whose `created_at` is later than a
  matching `dnc_list` row. This is the query with TCPA consequences and it comes back empty.
- **Live Stripe is empty.** `acct_1SPlV5FmPAhggcMQ`, livemode: 0 customers, 0 products,
  no charges ever. Every paying user is on the sandbox `acct_1SPlVzFyk0lZUopF`, so #153 and
  #154 (free credits, free numbers) have cost nothing real — they become real the moment the
  keys are switched. This closes the "is the live account activated?" question that
  `docs/STRIPE_LIVE_CATALOGUE.md` recorded as unverified.

### Still broken

- **Quiet hours never save (#178).** `app/api/settings/quiet-hours/route.ts:73` writes
  `users` through the session client; `authenticated` may UPDATE only `business_hours`,
  `business_name`, `timezone`, `updated_at`. Postgres returns `42501` and the route reports
  success. That file was last touched 2025-11-17 — it has never worked. The user sets quiet
  hours and messages can still send inside them.
- **Balances do not reconcile with the ledger (#183).** 4 of 7 users, ~110,000 points of
  drift. `rios.healthcaresolutions@gmail.com`: balance 29,784 against a ledger sum of
  **-216** — only the spends were ever recorded. The write path was fixed earlier
  (`add_credits`/`deduct_credits` now write the ledger row in the same transaction), but the
  **historical drift was never reconciled**, so every points display and analytics figure
  still reads from a ledger that disagrees with the balance.
- **PDF import fails two ways (#181)**, both *after* the commit meant to fix it: the
  `pdfjs-dist` worker is not in the Vercel bundle, and `DOMMatrix` does not exist in the
  Node runtime.

## Auto-refill had never once worked (#159, #186, 2026-08-06)

`/api/settings` wrote `auto_topup`, `auto_topup_threshold` and `auto_topup_amount`
through the **session client**. `authenticated` may UPDATE exactly four columns of
`public.users`, and none of these are among them, so Postgres refused every write
with `42501`. The result was never destructured, so the route returned `{ ok: true }`
and the Settings UI showed auto-refill **ON** while the column stayed `false`.

Verified live, with `timezone` as a control to prove the query discriminates:

| column | `authenticated` | `service_role` |
|---|---|---|
| `auto_topup` | **false** | true |
| `auto_topup_threshold` | **false** | true |
| `auto_topup_amount` | **false** | true |
| `timezone` (control) | true | true |

**The failure was total, not intermittent.** `auto_topup` is `false` on all 7
accounts, and `/api/cron/auto-buy` has executed 70+ times since 2026-08-03 without
ever having a row to act on. A cron running successfully and doing nothing looks
identical to a cron with no work.

Two smaller things fixed alongside:

- **`auto_topup_amount` is now pinned to a real pack size.** `packForPointsAmount()`
  returns the smallest pack `>= amount` and otherwise the **largest**, so an
  arbitrary value could never invent a price — but it could silently escalate
  someone from the $40 Starter pack to the $510 Enterprise pack.
- **A threshold of `0` survives.** It means "refill only when I hit zero", and `||`
  on both sides (settings *and* `auto-buy:71`) turned it into 100 — charging a card
  100 credits early, against an explicit instruction. Both are `??` now.

### The two DNC checks that were not the DNC gate

Deleted from `process-drips` and `send-sms`. Both read like the gate and were not:

```ts
send-sms       if (!dncError && dncCheck)   // skipped the block when the lookup failed
process-drips  const { data: dncCheck }     // dropped { error } entirely
```

**Neither was load-bearing**, which is worth stating precisely because the audit
that found them called this "the DNC gate fails open" — the highest-severity claim
of the night, and wrong. `checkSmsAllowed()` runs before the send in both paths
(drips 350 → send 402; send-sms 393 → send 461) and `lib/smsGuard.ts:432` returns
`{ allowed: false, reason: 'check_failed' }` on an RPC error. Drips are guarded
twice, since they send *through* `/api/telnyx/send-sms`.

The guard also handles the enrollment better than the code removed: it sets
`stopped_opted_out` with `next_send_at` cleared, where the deleted check set
`cancelled` and left `next_send_at` populated.

**The general rule this is an instance of:** a hand-rolled copy of a shared gate is
worse than no copy. It drifts, it gets the error handling wrong, and it makes the
real gate harder to find. `lib/smsGuard.ts` is the gate; do not re-implement it.

## Renewals work; the accounts don't have subscriptions (#185, 2026-08-06)

Six of seven accounts were past `next_renewal_date`, the oldest by eight months,
and this was filed as "no monthly credit-renewal job exists". **That diagnosis was
wrong, and acting on it would have shipped a serious bug.**

The renewal path is correct and works. `invoice.paid` with `billing_reason
'subscription_cycle'` grants the monthly credits and rewrites `next_renewal_date`
from Stripe's real billing period (`webhook/route.ts:542-560`). Credits follow money
actually collected.

What the data actually says:

| account | tier | stripe_subscription_id | next_renewal_date |
|---|---|---|---|
| tripped620@ | scale | **present** | 2026-08-24 — *future* |
| elementp293@ | growth | none | 2025-12-12 |
| trippbrowning620@ | growth | none | 2026-03-04 |
| trippebrowning@ | growth | none | 2026-03-03 |
| rios.healthcaresolutions@ | scale | none | 2026-02-24 |
| 2 unpaid accounts | unpaid | none | past |

**The one account with a subscription is the one account that is not past due.**
The other six have no `stripe_customer_id` and no `stripe_subscription_id` at all —
they never subscribed, so no `invoice.paid` ever fires, so nothing renews. Their
`next_renewal_date` is a fossil written at signup and never touched since.

### Do not add a renewal cron

`lib/renewalSystem.ts:1-7` documents this exact thing being removed: a client-side
function that treated a stale or null `next_renewal_date` as "renewal overdue" and
**granted a bonus month of credits to every new signup on first page load**,
disconnected from whether Stripe had charged them. A cron granting credits from
`next_renewal_date` is that same bug on a schedule, and it would hand free months to
the four accounts holding a paid tier with nothing billing them.

### What was actually wrong

1. **Four accounts hold `growth`/`scale` with no subscription** — full tier
   allowance and the Scale pack discount, billed to nobody. `npm run health` now
   warns on it (`paid tiers have a subscription`). Whether those are comped accounts
   or bad data is a business decision, not a code fix.
2. **`daysUntilRenewal` returned a negative number to the UI** — as low as -238 —
   because both `getDaysUntilRenewal()` and `getSubscriptionInfo()` computed a
   difference against the fossil date. They now return `null` unless a
   `stripe_subscription_id` exists, via one shared `renewalDaysFrom()` helper.
   Callers already handled null; it was the no-date case.
3. **`subscription_status` is `'active'` on all seven accounts**, including the two
   `unpaid` ones. It is defaulted and never meaningfully written — do not gate on it.

## Quiet hours could never be saved (#178, 2026-08-06)

`/api/settings/quiet-hours` wrote `quiet_hours_enabled`, `quiet_hours_start` and
`quiet_hours_end` through the **session client**. Verified live, with `timezone` as
a control that proves the difference is per-column and not per-table:

| column | `authenticated` | `service_role` |
|---|---|---|
| `quiet_hours_enabled` | **false** | true |
| `quiet_hours_start` | **false** | true |
| `quiet_hours_end` | **false** | true |
| `timezone` (control) | **true** | true |

Every save failed with `42501` except a timezone-only one, and a *mixed* update
failed wholesale because the statement named a column the role could not write.
The proof it never worked: **all 7 accounts hold byte-identical defaults** —
`enabled: true, 08:00:00–20:00:00, America/New_York`. Not one has ever been changed.

**This one failed loudly.** Unlike #159 the route checked its error and returned
500, so nobody was told a save had succeeded. But the effect on sending is the
same: `lib/smsGuard.ts:399` reads all four columns on every send, so the window
being enforced was always the stored default and a user could neither widen it,
narrow it, nor switch it off.

Also added: the timezone is now validated by constructing an
`Intl.DateTimeFormat` with it. An unrecognised zone is not cosmetic —
`is_within_quiet_hours()` resolves the window in that zone, so a bad string means
the window cannot be evaluated at all. Validating against the runtime's own zone
list avoids a hand-kept list that would drift.

**The pattern, now four routes deep** (#156, #157, #159, #178): any write to
`public.users` outside `business_hours`, `business_name`, `timezone`,
`updated_at` needs `createServiceRoleClient()`. The session client is correct for
SELECTs — RLS covers those — and wrong for essentially every UPDATE.

## Pause/resume mutated Stripe, then failed the local write (#156, #157, 2026-08-06)

Two more instances of the `public.users` column-grant trap, both on billing paths.

**`/api/stripe/pause-subscription`** wrote `subscription_status` and
`pause_resumes_at` through the session client, on both POST (pause) and DELETE
(resume). Its error handling was already *correct*, which is what made this worse
than a plain breakage: Stripe was mutated **first**, Postgres then refused the
write with `42501`, and the user got "paused with Stripe but failed to save
locally, please contact support". So a pause genuinely voided real invoices while
the app still showed the plan active, and a resume genuinely restarted collection
while the app still showed it paused.

**`/api/stripe/create-number-subscription`** wrote `stripe_customer_id` with the
session client and **never destructured the result at all**. This one compounds:
the id never persists, so the next call takes the same branch and creates *another*
Stripe customer. Each can carry its own subscription, and the account accumulates
recurring charges attached to customers no `users` row references — unreachable
from the billing portal and invisible to cancellation. It now bails with a 500
before anything is ordered or charged; a stranded customer object with no
subscription is inert, a live subscription nothing can find is not.

Verified live, `updated_at` as the control:

| column | `authenticated` | `service_role` |
|---|---|---|
| `stripe_customer_id` | false | true |
| `subscription_status` | false | true |
| `pause_resumes_at` | false | true |
| `updated_at` (control) | **true** | true |

### The count so far

`#156, #157, #159, #178` — four routes, one bug. A grep for session-client writes
to `users` then turned up **two more** in Google Calendar
(`calendar/oauth/callback`, `calendar/book-slot`), where all three
`google_calendar_*` token columns are equally unwritable. Filed separately.

**The rule:** `public.users` accepts exactly four columns from `authenticated` —
`business_hours`, `business_name`, `timezone`, `updated_at`. Everything else needs
the service-role client. SELECTs are fine on the session client; RLS covers those.
When a route mutates an external system (Stripe, Telnyx) and then writes locally,
getting this wrong does not merely fail — it desynchronises the two.

## Google Calendar tokens could not be written (#187, 2026-08-06)

Fifth and sixth instances of the `public.users` column-grant trap, found by
grepping for session-client writes to `users` after fixing #156/#157 — not by an
audit. All three token columns are unwritable by `authenticated`
(`google_calendar_access_token`, `_refresh_token`, `_token_expiry`).

- **`calendar/oauth/callback:67`** — the initial save after OAuth. It *did* check
  its error, so it failed loudly and redirected to `?calendar_error=save_error`.
- **`calendar/book-slot:32`** — the `oauth2Client.on('tokens')` rotation handler,
  two writes, **neither result destructured**. Every rotation was silently dropped
  and the stored access token went stale.

**One account holds tokens**, written before the grants were tightened, which is
why this looked like a working feature. Anyone connecting today would fail.

Two things fixed beyond the client:

- The rotation handler **no longer overwrites a good refresh token with
  `undefined`**. Google re-issues a refresh token only occasionally; the old code
  had two branches and the `access_token`-only branch was fine, but building the
  update from whichever fields are actually present is safer than branching, and
  makes "never clobber the refresh token" explicit.
- The handler is fire-and-forget inside `googleapis` — nothing awaits it and there
  is no caller to return an error to — so it now logs loudly naming the user.

**Not a bug, for the next person:** a validation hook flags
`request.nextUrl.searchParams` in this route as needing `await` for Next 16. That
is a false positive twice over — this project is on Next **14.2.33**, and the async
`searchParams` change applies to *page props*, never to `NextRequest.nextUrl` in a
route handler, which is synchronous in every version. Do not "fix" it.

## The plan-change credit printer (#153, 2026-08-06)

`/api/stripe/change-plan` granted a full 10,000 credits on every growth→scale
transition and recorded nothing saying it had. Because a downgrade **deliberately
preserves the balance**, the pair was a money printer:

```js
for (;;) { POST {planType:'scale'}; POST {planType:'growth'} }
```

Each lap saw `oldPlan === 'growth'` again and granted another 10,000 — one full
$98 Scale month per iteration. `proration_behavior: 'create_prorations'` only
writes proration lines onto the *next* invoice, and an up-then-immediately-down
pair nets to roughly zero, so the laps were free. Nothing throttled it:
`middleware.ts` excludes `/api`, and no route under `app/api/stripe/` imports
`lib/rateLimit`.

### The fix, and why it is atomic

A deterministic `stripe_session_id` passed to `add_credits`:
`plan-upgrade:<user_id>:<billing_period_start>`.

`points_transactions` carries two partial unique indexes on that column —
`(stripe_session_id)` and `(user_id, stripe_session_id)`, both
`WHERE stripe_session_id IS NOT NULL`. And `add_credits` does its `UPDATE users`
and its ledger `INSERT` **inside one plpgsql function**, so a duplicate key raises
`23505` and rolls the credit grant back with it. This is real atomic idempotency,
not check-then-act — there is no window between the two.

Proven against the live database inside an aborting `DO` block:

```
before=29784  after_first=30284  after_repeat=30284
repeat raised 23505 and granted nothing
```

`23505` from this call is therefore **not an error** — it means "already granted
this period" and the route reports success without granting again.

**The fallback key must never vary per request.** If the billing period cannot be
read it falls back to a month bucket (`month-YYYY-MM`), never a timestamp — a
per-request key would restore the unlimited loop exactly.

### Residual, deliberately not closed here

Credits are still granted **before** the money is collected: the proration lands on
the next invoice. The durable fix is to grant on `invoice.paid` the way renewals
already do (`webhook/route.ts:542-560`). What remains after this change is one
grant per billing period rather than unlimited, which is a rate limit rather than a
correctness guarantee.

Also added: an upgrade now requires subscription status `active` or `trialing`
(#163). `subscriptions.update()` succeeds for `past_due`, `unpaid` and
`incomplete`, so a card that had been declining for months could still buy the
Scale top-up. **Downgrades stay allowed from any status** — never trap someone on
the expensive plan because their card is failing.

### Never probe with a bare mutation

The first attempt at proving the idempotency ran `add_credits` directly and moved
a real user's balance from 29,784 to 30,284 before restoring it. Wrap probes in a
`DO` block that ends in `RAISE EXCEPTION`: the block is one transaction, the raise
aborts it, and the result comes back in the error message. Nothing persists.

## Additional numbers were ordered and never billed (#154, 2026-08-06)

`/api/stripe/create-number-subscription` orders the number from Telnyx **before**
charging. That ordering is deliberate — the comment in the route says not to bill a
customer for a number Telnyx refused — and the reasoning is sound right up until
the charge can never succeed. Then it guarantees the opposite failure.

The price id was:

```ts
process.env.STRIPE_PHONE_NUMBER_PRICE_ID || 'price_phone_number_monthly'
```

**That env var is not set in production.** Confirmed with `vercel env ls
production`: the only Stripe variables there are `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. So every request
fell through to a literal that exists in no Stripe account, `subscriptionItems.
create` threw, and the route had already provisioned a real number billed to the
platform's Telnyx account. It is set in `.env.local`, which is why it would have
looked fine to anyone testing locally.

### What changed

1. **No placeholder fallback.** The constant is `null` when unset.
2. **The price is proven to exist before Telnyx is touched** — `prices.retrieve`,
   plus an `active` check so an archived price is caught too. One API call, and it
   makes the later charge unable to fail for the reason it always failed.
3. **Charge failure now releases the number.** Anything else going wrong at charge
   time (card, subscription state, Stripe outage) hands the number back rather than
   leaving the platform paying for it.
4. **The `user_telnyx_numbers` upsert error is checked** (#165). It was a bare
   `await` followed by `{ success: true }` regardless. A number that is ordered and
   billed but unlinked is invisible in the UI and unreleasable through the app.
   Deliberately **not** released in that case — the customer paid for it — so it
   returns a 500 naming the number for manual reconciliation.

### This route now fails closed in production

Until `STRIPE_PHONE_NUMBER_PRICE_ID` is set, buying an additional number returns
**503 "Number purchasing is not configured yet"**. That is the intended behaviour:
refusing the sale costs nothing, while the previous behaviour gave away a real
number on every attempt. `docs/STRIPE_LIVE_CATALOGUE.md` already lists this as one
of the eleven prices to create — the "Additional Phone Number, $1.00/month" row,
whose price is flagged there as needing confirmation since Telnyx charges about
$1/month before any messaging.

## The webhook branch that called every failure a duplicate (#158, 2026-08-06)

`webhook/route.ts` fulfils a subscription by inserting the `points_transactions`
row **first**, using `stripe_session_id` as the idempotency claim, then setting the
tier and granting credits. The claim check was:

```ts
if (txInsertError) {
  console.log('already processed — skipping duplicate webhook');
  break;
}
```

It never looked at the error code. **Any** failure read as "already processed", and
everything after it was skipped: the tier update, the `add_credits` grant, and the
user-creation fallback. The handler then returned 200, so Stripe never retried, and
`notifyAdmins` was never called. A customer pays $30 or $98 and receives no tier,
no credits, and nobody is told.

The pack branch (`:400`) and the renewal branch (`:523`) have always checked
`PG_UNIQUE_VIOLATION` and escalated otherwise. This branch was the lone exception.

### The part that is worse than it looks

`points_transactions` has no CHECK constraints, but it does have:

```
points_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

So for a first-time subscriber with no `users` row, that insert fails **23503**,
which the old code called a duplicate. That made the `if (!existingUser)` branch
below it — the entire first-subscription account-creation path, complete with its
own escalating `notifyAdmins` — **unreachable by construction**. It could only run
in the case where the row it creates already existed.

The fix checks the code, escalates anything that is not `23505`, and returns a body
saying so. Worth remembering as a shape: **an idempotency claim that treats every
error as "already done" converts every transient failure into silent data loss**,
and if the claim has a foreign key, it also silently disables whatever repair path
sits downstream of it.

## "Upgrade to Scale" created a second subscription (#162, #176, 2026-08-06)

`/api/stripe/create-checkout` never read `stripe_subscription_id`, so Settings →
**Upgrade to Scale** ran a fresh checkout for someone who already had a plan. In
`mode: 'subscription'` a session carrying only `customer_email` makes Stripe mint a
**brand-new Customer**, and the webhook then overwrites `stripe_customer_id` and
`stripe_subscription_id` with the new pair. The original $30 Growth subscription
ends up referenced by nothing: still billing, unreachable from the billing portal
(which opens on `stripe_customer_id`), and invisible to cancellation. The customer
pays $30 **and** $98.

The route now returns **409 `subscription_exists`** when a live subscription is
found, and the Settings button routes that to `/api/stripe/change-plan`, which
repoints the price on the subscription that already exists. Onboarding's caller
needed no change — it already surfaces `result.error` on a non-OK response, and
"You already have an active subscription" is the right message there.

**Checked against Stripe, not the column.** `stripe_subscription_id` can be stale:
cancelling through the billing portal writes `subscription_status` but leaves the
id in place (#168). So the guard retrieves the subscription and only refuses on a
genuinely live status — `active`, `trialing`, `past_due`, `unpaid`, `paused`. If
the id does not resolve at Stripe at all, it falls through and lets them subscribe.

### The same bug was quietly costing point-pack buyers too

The session passed `customer_email` on **every** path, so each point-pack purchase
also minted a new Customer. A user's charges scattered across several of them, and
the portal showed only whichever was written last. It now passes
`customer: stripe_customer_id` when one is known. Stripe rejects `customer` and
`customer_email` together, so it is strictly one or the other.

### Also fixed: the 500 handler leaked Stripe internals (#176)

The catch block returned `details: error` — the serialized Stripe error, carrying
`raw`, `code`, `param`, `requestId`, the attempted price id, and on an auth failure
a message of the form `Invalid API Key provided: sk_test_***…` that leaks the key's
mode and last characters. Any authenticated caller could force it. The response is
now a fixed string; `console.error` still keeps the detail server-side.

## The ledger now reconciles, and stays that way (#183, 2026-08-07)

`users.credits` and `SUM(points_transactions.points_amount)` disagreed by **109,968
points across 4 of 7 accounts**, because `add_credits` and `deduct_credits` used to
move the balance without writing a ledger row.

| account | balance | ledger | drift |
|---|---|---|---|
| tripped620@ | 59,547 | 2,579 | **+56,968** |
| rios.healthcaresolutions@ | 29,784 | **-216** | **+30,000** |
| trippebrowning@ | 209,400 | 187,400 | **+22,000** |
| trippbrowning620@ | 4,000 | 3,000 | **+1,000** |

`rios` is the clearest case: a **negative** ledger against a 29,784 balance means
only the spends were ever recorded — the 30,000-credit grant has no row at all.

**Owner's decision: balances win.** Users have been spending against them, so the
balance is the number with real-world consequences; the ledger is the record that
failed to keep up. Closed with one `reconciliation` row per drifted account,
changing no balance. Migration: `supabase/migrations/20260807_ledger_reconciliation.sql`,
already applied.

### Why writing to points_transactions was safe

**There are no triggers on `points_transactions`** — checked against `pg_trigger`
before running. That is the entire safety argument: had a trigger updated
`users.credits` on insert, this reconciliation would have *doubled* every drifted
balance instead of recording it. Check that before ever writing to a ledger table.

Idempotent, because `stripe_session_id` carries two partial unique indexes and the
key is `ledger-reconciliation-2026-08-07:<user_id>`. Verified by running it twice —
0 rows the second time. Reversible with
`DELETE FROM points_transactions WHERE action_type = 'reconciliation'`.

`reconciliation` is a new `action_type`, deliberately distinct from the four in use
(`spend`, `purchase`, `earn`, `subscription`) so these rows are trivially
identifiable and never mistaken for real activity.

### The assertion is the actual deliverable

`npm run health` now **FAILS** on any per-user drift. Reconciling once is
housekeeping; the check is what makes it stay true. New drift means some write path
is moving credits without going through `add_credits`/`deduct_credits` — the exact
bug class this project keeps reproducing, and previously nothing would have noticed.

## Every SECURITY DEFINER function pins its search_path (#151, 2026-08-07)

24 of the 49 SECURITY DEFINER functions in `public` had a mutable `search_path`.
They run as the function **owner**, so with the path unpinned the **caller** picks
the schema resolution order and a same-named object in an earlier schema is what
the body actually touches. The affected set included `check_dnc`, `add_to_dnc`,
`bulk_add_to_dnc`, `remove_from_dnc`, `schedule_message` and
`is_within_quiet_hours` — the compliance gate and the send scheduler.

All 24 pinned to `public, pg_temp`. `npm run health` now reads
`SECURITY DEFINER fns pin search_path — all pinned`.

### Why public+pg_temp was safe, and when it would not be

Checked against `pg_proc.prosrc` **before** running:

1. None referenced another schema explicitly (`auth`, `extensions`, `net`,
   `storage`, `graphql`, `vault`, `pgsodium`, `cron`).
2. None called an extension function **unqualified**. This is the one that would
   have bitten: `pgcrypto` and `uuid-ossp` are installed in the `extensions`
   schema, so a single bare `crypt()`, `gen_salt()` or `uuid_generate_v4()` would
   have started failing the moment the path was pinned. There were none.

`pg_catalog` is always searched implicitly and never needs naming — which is why
`gen_random_uuid()` (pg_catalog since PG13) is fine either way.

**If a function does need an extension**, pin it to `public, extensions, pg_temp`
or schema-qualify the call. Do not leave it unpinned.

### The migration is catalog-driven on purpose

It loops over `pg_proc` and `ALTER`s by identity arguments, so overloads are handled
correctly and re-running is a no-op — already-pinned functions stop matching the
filter. A hand-written list of 24 signatures would rot the moment anyone adds a
function.

### Verified after, not just applied

`ALTER FUNCTION` succeeding proves nothing about whether the bodies still work.
Exercised afterwards: `check_dnc` still returns `on_dnc_list: true` for the known
opt-out and `false` for a clean number, and `is_within_quiet_hours`,
`get_messages_ready_to_send`, `get_ai_drips_ready_to_send`,
`get_campaigns_ready_for_batch`, `find_overdue_crons` and `get_dnc_stats` all
return correct results.

## anon can no longer write (#149, 2026-08-07)

`anon` held INSERT, UPDATE and DELETE on **58 of 63** public tables, leaving RLS as
the only thing between an unauthenticated request and a write. The 2026-08-06 audit
found **41 (table, command) pairs with a DML grant and no matching policy at all**,
so the fence was not uniform — and RLS is a row filter, not an authorisation
boundary.

Revoked. `anon` now holds SELECT only.

### Verified by executing, both directions

**Before**, that nothing needs it: `/api/opt-in/submit` (the only public write path)
uses the service role; `app/auth/register` does no table writes, since the
`handle_new_user` trigger creates the `public.users` row; `app/auth/onboarding`
writes only after sign-in, so it acts as `authenticated`. The browser client uses
the anon *key*, but with a session PostgREST resolves the role to `authenticated` —
revoking from `anon` does not touch signed-in users.

**After**, with the real anon key against PostgREST — every one `401 permission
denied`:

```
INSERT leads, dnc_list, campaigns, messages, user_telnyx_numbers, points_transactions
PATCH  leads
DELETE leads
SELECT leads -> 200 []          (RLS filters it; intended)
```

`points_transactions` is the one to notice: anon could previously have inserted
credit ledger rows.

### The revoke cannot be made permanent, only monitored

`ALTER DEFAULT PRIVILEGES IN SCHEMA public` covers tables created by the migration
role. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` and `... FOR ROLE supabase_admin`
fail with `42501` from here — not grantable. So Supabase can still re-grant DML to
`anon` on tables created by those roles, and **this will silently come back the next
time a table is created that way**.

That is why `npm run health` now asserts the live grant state on every run:

```
ok   anon cannot write            no INSERT/UPDATE/DELETE granted
```

It FAILS and names the offending `table:privilege` pairs otherwise. The check is the
durable part; the revoke is just today's state.

### SELECT deliberately left alone

RLS is enabled on every table and the policies key on `auth.uid()`, so anon reads
return nothing — confirmed above. Revoking SELECT as well risks breaking public
pages for no protection gained today. Worth its own investigation rather than a
drive-by change.

## Deleting an account destroyed pool numbers and re-issued them (#161, #172, #173, 2026-08-07)

`/api/user/delete-account` selected only `phone_number` from
`user_telnyx_numbers`, so its loop could not tell a number the **user bought** from
a shared-pool number the **platform owns**. It then did both of these to every one
of them:

1. `DELETE https://api.telnyx.com/v2/phone_numbers/{id}` — destroying it at the
   carrier;
2. `releasePoolNumber(...)` — which sets `is_assigned = false` and marks it
   claimable again.

`/api/number-pool/claim` does not re-purchase. It flips `is_assigned` and inserts
the string into `user_telnyx_numbers`. **So the next signup would be handed a
number the platform no longer owns** — sends fail, inbound goes nowhere, and
nothing indicates why.

This was live, not theoretical. `tripped620@gmail.com` currently holds three
numbers and **`+18887062631` is pool-owned**. Deleting that account would have
destroyed a TFV-verified number and re-issued it — against 2 claimable numbers,
a third of remaining onboarding inventory, and TFV takes days to replace.

### Ownership comes from number_pool, never from releasePoolNumber's return

`releasePoolNumber` reports `{ pooled: false }` on **error** as well as for a
genuine non-pool number (`lib/numberPool.ts:76-79` logs and returns rather than
throwing). Branching on it would destroy exactly the number the check exists to
protect. Ownership is now a `number_pool` membership lookup, and **if that lookup
fails, nothing is released at Telnyx at all** — an orphaned number costs about
$1/month, a wrongly destroyed one cannot be recovered and takes its TFV with it.

### Two silent failures in the same loop, fixed alongside

- **#172** — neither Telnyx call was checked. `listRes` was parsed straight into
  `listData.data?.[0]?.id`, so a rate limit or a rotated key looked identical to
  "no such number" and the release was skipped in silence; the DELETE's status was
  never inspected either, so a 409 on a number locked in a porting order vanished.
- **#173** — `releasePoolNumber`'s return value was discarded. On failure,
  `number_pool` kept `is_assigned = true` while the users row was deleted
  underneath it; `assigned_to_user_id` is a FK with **ON DELETE SET NULL**, so the
  owner became NULL and `is_assigned` stayed true. Claim queries filter on
  `is_assigned = false`, making that row permanently unclaimable. Both now escalate
  by email.

`npm run health` asserts the aftermath directly:
`no stranded pool numbers — every assigned row has an owner`. Currently zero, so no
existing damage to repair.

## Deleting an account did not stop billing (#160, 2026-08-07)

`/api/user/delete-account` cancelled Stripe subscriptions with
`status: 'active'`. Three silencers were stacked:

1. **`status: 'active'` misses every other billable status.** `past_due` is the
   one that matters — the card declined, Stripe dunns for roughly three weeks, and
   that is precisely the user most likely to hit Delete Account. They received
   `200 {"success":true}` and Stripe's next smart retry charged the card for an
   account that no longer existed. `unpaid`, `trialing`, `paused` and `incomplete`
   were skipped too.
2. **The `users` read did not destructure `error`**, so a failed lookup cancelled
   nothing and reported nothing.
3. **The `catch` swallowed everything** and continued to deletion regardless.

### Deletion is now blocked when billing cannot be stopped

This is the deliberate part. Deleting the account destroys `stripe_customer_id` —
the very reference needed to find and stop the subscription afterwards. So a
failure here is **unrecoverable in a way that refusing to delete is not**: the user
keeps their data and can retry, and nobody is charged for an account that is gone.
A cancellation failure returns 502 and pages an admin.

The tradeoff, stated plainly: if Stripe is unreachable, account deletion is
unavailable until it recovers. That is the right way round.

### It also searches Stripe by email

`create-checkout` used to mint a fresh Customer per checkout (#162), so historical
duplicates exist that no `users` row references. Cancelling only
`users.stripe_customer_id` would leave those billing for ever with the account
gone. `customers.list({ email })` finds them; every non-terminal subscription on
every matching customer is cancelled.

Terminal statuses — `canceled`, `incomplete_expired` — are skipped. Everything else
can still produce a charge, so it is safer to enumerate what cannot bill than to
guess what can.

## Cancelling never revoked access, and pausing was unlimited (#167, #168, #169, 2026-08-07)

### subscription_status is not a gate. account_status is.

`customer.subscription.deleted` wrote **only** `subscription_status: 'canceled'`,
and nothing reads that column to decide whether someone may send.
`lib/smsGuard.ts:324-351` gates on `account_status` and `suspended_until`. So
cancelling through the billing portal left `account_status` at `'active'` and the
user kept sending, kept their credit balance, kept their numbers, and could keep
buying point packs — with no subscription at all.

`subscription_status` was never usable as a gate anyway: it **defaults to
`'active'` and is barely written**. All 7 accounts read `'active'` today, including
the two on the `unpaid` tier. Do not gate anything on it.

The handler now also writes `account_status: 'cancelled'` — **two Ls**;
`users_account_status_check` allows `active | suspended | trial | cancelled`, and
`'canceled'` would fail the constraint. `smsGuard`'s `SENDING_STATUSES` is
`['active','trial']`, so `cancelled` blocks sending immediately. Re-subscribing
restores it: `webhook/route.ts:333` and `:368` set `account_status: 'active'` on
checkout completion, so cancellation is not a dead end.

### A zero-row update is not an error (#169)

`.eq('stripe_subscription_id', canceledSub.id)` matched **nothing** for an
additional-phone-number subscription, because that id lives on
`user_telnyx_numbers`, not `users`. supabase-js returns no error for a zero-row
update, so the handler logged "Recorded cancellation" and did nothing. It now
checks the returned rows and falls through to deactivating the number.

`user_telnyx_numbers.status` has **no CHECK constraint** (free text), and
`lib/resolveFromNumber.ts:157,188` both filter on `status = 'active'` — so writing
`'inactive'` genuinely removes the number from the sending pool. Verified before
relying on it.

### Pause was indefinite free service (#167)

Nothing checked whether the subscription was already paused. `behavior: 'void'`
keeps the subscription advancing through periods while every invoice is created and
voided, so `item.current_period_end` moves forward each cycle — and each new call
recomputed `resumesAt` from the **current** period end and pushed it further out.
Calling this once per cycle was free service for ever.

Two guards now: a **409 if already paused**, and a cap of **2 pause cycles per
rolling 12 months**.

The counter lives in **Stripe subscription metadata** (`pause_cycles_used`,
`pause_window_start`), not a new column — it travels with the subscription,
survives anything done to the `users` row, and the customer cannot reset it. The
window is stamped only when a new one opens, so the 12 months run from the *first*
pause rather than sliding forward with each one.

**Resuming deliberately does not give cycles back.** The cap counts cycles
*granted*, not consumed — refunding on resume would make pause / resume / pause the
same indefinite loop the cap exists to close.

**Still inconsistent, deliberately left:** the UI offers pause only to Scale
(`points/page.tsx:406`) while the API accepts any account holding a
`stripe_subscription_id`. Whether pause is a Scale perk is a product decision, not
a bug fix.

## The rest of the Stripe audit (#155, #163, #164, #166, #170, #171, #174, #175, 2026-08-07)

- **#155 / #166 — the pre-checks now sit ABOVE the branch.** 10DLC eligibility,
  ownership and toll-free verification ran only inside the
  has-an-active-subscription branch of `create-number-subscription`. The checkout
  branch ran none of them, so a user with no subscription could pay for a number
  that was already owned or an unverified toll-free, and only *then* would the
  webhook refuse to order and file a ticket asking a human to refund. And this was
  the **only** number-acquisition path without `checkNumberEligibility` — the other
  three all gate. All three checks are hoisted, so both paths get them.
  (`.maybeSingle()`, not `.single()`: no-rows is the ordinary case here and
  `.single()` treats it as an error.)

- **#164 — a failed top-up now pages someone.** `add_credits` failing after the
  plan was repriced logged a console line and returned `ok: true`. The user had
  been moved to $98 and charged the proration with no credits. Now escalates by
  email and returns `creditsGranted: false` with a `warning`, so the UI stops
  celebrating. The webhook has always escalated the byte-identical failure; this
  route had no alerting import at all.

- **#174 — `subscriptionType` is validated.** Only `=== 'scale'` was ever tested,
  so any other string fell through to the **Growth price** while being copied
  verbatim into `metadata.planType` and written straight into `subscription_tier`
  and `plan_type` — both of which carry CHECK constraints allowing only
  `unpaid|growth|scale`, so the write failed 23514 *after* the customer paid.

- **#175 — pause no longer resumes on the boundary.** With `cycles=1`, `resumesAt`
  was exactly `current_period_end` — the same instant Stripe closes the period and
  raises the renewal invoice, making the skipped charge ordering-dependent inside
  Stripe. Now steps one day past, which is far inside the next period (the shortest
  real billing period is 28 days) so it cannot skip an extra renewal.

- **#170 — the monthly false alarm is gone.** `invoice.paid` looked up `users` by
  `stripe_subscription_id`, but an additional phone number bills as its own
  subscription whose id lives on `user_telnyx_numbers`. The lookup missed **by
  design** and fired an escalated "customer charged, nobody got credits" email
  every month, for every extra number, for ever. It now checks
  `user_telnyx_numbers` first and logs quietly. An alert that is wrong on a
  schedule trains people to ignore the channel a real one uses.

- **#171 — auto-buy cannot double-charge.** The grant was already guarded by the
  PaymentIntent id, but that only helps when the *same* intent is seen twice. The
  dangerous sequence was the other one: killed mid-loop after a charge succeeded
  but before `add_credits`, the next run created a **brand new** intent and charged
  again — different id, nothing deduped it. A deterministic idempotency key makes
  Stripe return the original intent instead. Also `export const maxDuration = 60`,
  which every other work-doing cron already had and this one — the one charging
  cards serially — did not.

  **The trade-off is deliberate:** the key is day-bucketed (Stripe keys live 24h),
  so a user who genuinely burns a whole pack twice in one day is not auto-refilled
  the second time and must buy manually. Blocking a rare second refill is far
  cheaper than double-charging a card.

## PDF import: the points ledger settles what the logs cannot (#181, 2026-08-07)

Filed as broken from two production errors. **Both predate their own fixes**, by
one and two minutes respectively:

| error | logged at | fixed by | landed |
|---|---|---|---|
| `DOMMatrix is not defined` | 00:09:43Z | `1755082` shim browser globals | **00:11:39Z** |
| `Cannot find module …/pdf.worker.mjs` | 00:18:06Z | `cd3f2ce` trace the worker file | **00:19:15Z** |

Four commits in 45 minutes, each deploy surfacing the next failure — which is
exactly what makes a 7-day error window misleading. This is the **second** time
in one session that a log-derived issue turned out to be already fixed.

### The ledger is a better oracle than the logs

`/api/leads/upload-document` charges 5 points up front and **always refunds on a
parse failure**. So a spend with no matching refund is positive proof the parse
succeeded — a signal the logs cannot give, because success writes nothing.

```
00:09:44  -5  then +5   "Refund — DOMMatrix is not defined"
00:18:07  -5  then +5   "Refund — Cannot find module …pdf.worker.mjs"
00:25:43  -5            no refund  ← parse succeeded, after cd3f2ce deployed
00:30:15  -5  then +5   "Refund — Corrupted zip ?"   (a genuinely bad xlsx)
```

Where a route charges before doing work and refunds on failure, `points_transactions`
is an audit trail of what actually worked. Reach for it before concluding anything
from an absence of errors.

### What is and is not established

Established: no runtime errors on that route in 3 days; the fixes deployed before
the last successful upload; `pdfjs-dist` is hoisted to top-level `node_modules` so
the `outputFileTracingIncludes` glob resolves, and `pdf.worker.mjs` exists at
exactly the path the error named.

**Not established:** that the 00:25:43 upload was specifically a PDF. The
description column is generic (`Document uploaded with AI processing`) and the
route returns a preview rather than inserting, so no `leads` row records the
format. A single PDF upload would settle it.

Also worth knowing: the route **returns parsed leads for confirmation and inserts
nothing**. Absence of `leads` rows after an upload is not evidence of failure.

## The cron monitor cried wolf for three days (#182, 2026-08-07)

~700 log lines over three days claiming `auto-buy: has never run;
send-appointment-reminders: has never run`, while both had hundreds of rows in
`cron_runs`. Four separate defects, in the monitor rather than the crons.

**First, what it was NOT.** Those lines were `console.error` from the *throttled*
path in `alertAdminsThrottled` — suppressed repeats, not 700 emails. And the text
was recomputed on every call, not replayed from a stored payload. Both worth
stating because either would have led the fix somewhere useless.

### 1. The message was built from the value the guard had just distrusted

`recordRunAndCheckPeers` confirms the RPC against `cron_runs` before alerting —
then built its message from `o.last_ran_at`, the **RPC's** field. So a job the
guard had verified as running could still be announced as "has never run". The
description now comes from the table, falling back to the RPC only where the table
has nothing. **Report the reading you verified.**

### 2. The confirming read swallowed its error

```ts
const { data: actualRuns } = await admin.from('cron_runs')...   // no `error`
...
if (!seen) return true;   // "table agrees it has never run"
```

A failed read left `actualRuns` null, so every candidate fell through as
never-ran and the guard fired the exact alert it was written to prevent. "I could
not read `cron_runs`" is a third state, distinct from both "running" and
"stopped", and the only safe response is silence.

### 3. Two schedules that disagreed, with a silence window between them

The RPC did not return its grace, so the caller approximated it as
`expected_minutes * 1.5 + 20`:

| job | caller's guess | real grace |
|---|---|---|
| auto-buy | 110 | **90** |
| send-appointment-reminders | 200 | **180** |

Between 90 and 110 minutes, `auto-buy` was correctly flagged by the RPC and then
**actively suppressed by its own caller**. The RPC returns `grace_minutes` now and
the caller uses it. A monitor with two schedules silences real outages in the gap.

### 4. The external heartbeat had no cross-check at all

`/api/cron/heartbeat` relayed the RPC verbatim, so the same false claim could
arrive by a second route regardless of what was fixed in the first. The
confirmation is now `confirmOverdueAgainstTable()` in `lib/cronAuth.ts`, used by
both. Same lesson as the DNC pre-checks: **a hand-rolled copy of a shared gate is
worse than no copy.**

### Also: check-idle-campaigns was unwatched

Running on a Vercel cron and writing `cron_runs` since 2026-08-06, but absent from
the RPC's expected list — so nothing would ever have reported it stopped. Added at
1440/1560. `heartbeat` is deliberately left out: it is the external backstop on a
cadence GitHub throttles unpredictably, and paging because the out-of-app monitor
paused says nothing about the product.

## send-sms does not DNC-gate internal callers (#17 run, 2026-08-07)

Found by running `scripts/e2e-user-flow.js` as a regression check over a night of
changes — not by reading the code, which is the point.

`checkSmsAllowed()` in `send-sms` sits inside `if (!internalCaller)`. A caller
holding `x-internal-secret` therefore skips the **entire** gate, DNC included. The
harness POSTed there for a number it had just opted out and **the request reached
the Telnyx API**, which refused it only because the test number was unroutable.
Nothing in the route stopped it.

Today no path is actually exposed — all three internal callers of this route run
the guard themselves:

| caller | own gate |
|---|---|
| `receptionist/respond` | `checkSmsAllowed` ✓ |
| `cron/process-drips` | `checkSmsAllowed` ✓ |
| `cron/process-ai-drips` | `checkSmsAllowed` ✓ |

`sms-webhook` does **not** call this route for replies: it calls
`receptionist/respond` (gated), and sends canned text like the opt-out
confirmation through `sendTelnyxSMS()` directly. That last detail is why the
internal bypass has never broken the STOP confirmation — `checkSmsAllowed` blocks
DNC numbers unconditionally, so a confirmation routed through this route *would*
be blocked.

**An unconditional DNC check now runs for every caller**, above the
`!internalCaller` branch, failing closed on a lookup error. It is the one gate with
statutory rather than commercial consequences, and route safety should not depend
on each future internal caller remembering.

### Correcting `751fdc6`

That commit deleted this route's DNC pre-check saying "neither was load-bearing".
For `process-drips` that was right. For `send-sms` it was **wrong** — the deleted
check was the only DNC enforcement internal callers ever hit. The replacement
differs from the original in the way that matters: the old one read
`if (!dncError && dncCheck)`, which skipped the block whenever the RPC errored,
i.e. failed OPEN on precisely the lookup that counts.

### Two harness defects fixed while there

- **The send-gate check could never run.** It looked the lead up first and reported
  SKIPPED when absent — which is always, because opt-out deliberately erases the
  lead and keeps only the suppression (#109). It now tests the number, which is
  what the gate keys on, and separately asserts the erase-but-suppress contract.
- **A `+1555…` destination is rejected before any gate.** Area code 555 is not
  valid NANP, so the request died on validation and the check "failed" for a reason
  unrelated to DNC. The harness now prints the response body on failure, which is
  how this was untangled at all.

## Production wiring verified (#18, 2026-08-07)

All three systems checked against live infrastructure rather than config files.

### Telnyx — wired correctly, with one latent trap

| | |
|---|---|
| Inbound webhook | `https://hyvewyre.com/api/telnyx/sms-webhook`, api_version 2 |
| Reachable | POST returns **401 Missing signature** — live and refusing unsigned requests |
| Numbers on the profile carrying that webhook | **15 of 15** |
| `TELNYX_MESSAGING_PROFILE_ID` | points at that profile |
| Inbound actually arriving | 28 messages in 7 days |

**The trap: there are TWO messaging profiles, both named `HyveWyre LLC`.**

```
40019b32-c576-4908-95f3-08efbd6d07a3   webhook: NONE
40019b38-c8eb-4a0d-ba6e-3a4174db4ad2   webhook: .../api/telnyx/sms-webhook
```

Nothing uses the first one today. Any number that lands on it has its inbound
delivered nowhere, silently, while the number still reports `active` — the same
shape as #184. Identical names make picking the wrong one in the Telnyx UI easy.
Neither profile has a **failover URL** set, so a deploy blip drops inbound rather
than retrying it.

### Vercel cron — every job at exactly its configured rate

Over 26 hours, actual runs against `vercel.json`:

| job | schedule | expected | actual |
|---|---|---|---|
| process-scheduled | `*/5` | 312 | **312** |
| process-drips | `*/10` | 156 | **156** |
| process-ai-drips | `*/10` | 156 | **156** |
| auto-buy | `0 *` | 26 | **26** |
| send-appointment-reminders | `0 */2` | 13 | **13** |
| check-idle-campaigns | `0 9` | 1 | **1** |

Exact on all six. The GitHub-Actions backup is the known exception: 13 runs in 26h
against a declared `*/5`, roughly 4% — GitHub throttles shared-runner schedules,
which is why that path is an alarm and not a trigger.

### Delivery receipts — the concern this issue was opened for is resolved

`messages` by status, outbound:

| status | total | last 7 days | window |
|---|---|---|---|
| delivered | 26 | **23** | 2026-07-31 → 08-06 |
| sent | 57 | **0** | 2026-01-20 → 01-29 |
| queued | 4 | **0** | 2026-02-05 → 02-16 |

**Every outbound message in the last 7 days reached `delivered`.** The 61 stuck at
`sent`/`queued` all predate the fix that made the webhook handle `message.finalized`
(#135); 55 of them are test fixtures. Receipts are landing.

### Stripe — wired, but on the sandbox

The endpoint production actually uses is on the **test** account:

```
url:      https://www.hyvewyre.com/api/stripe/webhook
status:   enabled       livemode: false
events:   checkout.session.completed, customer.subscription.deleted,
          customer.subscription.updated, invoice.paid,
          payment_intent.payment_failed, payment_intent.succeeded
```

All six are handled by the route. Reachable: POST returns **400** from the
signature verifier.

Note it uses **`www.`** while Telnyx uses the bare domain. Both serve directly —
verified with `--max-redirs 0`, `num_redirects=0` on each — so this is cosmetic.
It would not have been: Stripe does not follow redirects on webhook delivery, and
a 301 there would fail every event silently.

**The live account has ZERO webhook endpoints** (confirmed via the Stripe MCP
against `acct_1SPlV5FmPAhggcMQ`). Creating one, and setting the **new** signing
secret, is a required step of the #81/#63 cutover — the secret is per-endpoint, so
reusing the sandbox value makes every live webhook fail verification.

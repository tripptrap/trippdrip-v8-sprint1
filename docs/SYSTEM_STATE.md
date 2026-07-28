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

**Worth fixing regardless:** `number_pool.is_verified` is set by hand and never reconciled
against Telnyx. It happened to be *correct* here, but it's an independent flag that can
drift from reality in either direction — and the whole scare above came from nobody being
able to check it easily. Deriving it from `getVerifiedTollFreeNumbers()`, or surfacing real
TFV status somewhere in the admin UI, would make this verifiable instead of assumed.

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
it was compliant. States spanning zones map to their **westernmost** zone deliberately —
guessing east risks sending before the morning cutoff; guessing west only errs
conservative. `leads.state` is free text and contains junk (`"NOW"`), so unrecognised
values fall back rather than guess.

**Credits: always use the `deduct_credits` RPC, never read-then-write.** Two paths had
read-modify-write races; `schedule/bulk` was the worst, writing back a `credits` value
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

Known limitation: timezone resolution is state-level. `leads.zip_code` would be more
precise for split states; `lib/geo/selectClosestNumber.ts` already does zip-based work if
that's ever wanted.

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
  this account has already lost numbers to a deactivation once. Fix: gate on
  `getVerifiedTollFreeNumbers()` at claim time, reconcile on a schedule, and surface real
  TFV status somewhere in the UI (there is currently no page showing it at all).

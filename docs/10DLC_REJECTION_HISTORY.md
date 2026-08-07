# 10DLC Rejection History & Compliance Checklist

Reference log of every Telnyx/TCR campaign submission, what was submitted, and why it
was denied. **Read this before drafting any new 10DLC campaign submission** — every
rule in `lib/telnyx10dlcDefaults.ts` traces back to a specific rejection below.

Brand: **HyveWyre LLC** — `4b20019b-eba4-6bfd-8723-dca9058142e8` — status **VERIFIED**
(reusable, no new brand fee). Only campaigns have been rejected, never the brand.

---

## Submission log

| # | Campaign ID | Date | Use case | Result | Reason(s) |
|---|---|---|---|---|---|
| 1 | `4b30019f-9cb7-9e4d-ac9b-40cb503f3615` | 2026-07-26 | MIXED | TELNYX_FAILED | 6 issues (see below) |
| 2 | `4b30019f-a105-6578-e000-54a13f5b7ce8` | 2026-07-27 00:41 | MIXED | TCR_EXPIRED | help/opt-in/opt-out standards |
| 3 | `4b30019f-a115-f6f7-3081-00a41955e269` | 2026-07-27 01:00 | MIXED | TELNYX_FAILED | sender identity + privacy policy |
| 4 | `4b30019f-a1d4-686f-b131-a9fa2c7ff808` | 2026-07-27 04:28 | LOW_VOLUME | TCR_FAILED | missing `subUsecases` |
| 5 | `4b30019f-a211-5044-960e-8212c4af0d4e` | 2026-07-27 05:34 | MIXED | TELNYX_FAILED | opt-in form had no consent checkbox |
| 6 | `4b30019f-a63a-3fb0-9c87-1ff6d84e7ac6` | 2026-07-28 01:00 | MIXED | TELNYX_FAILED | consent text didn't cover MARKETING |
| 7 | `4b30019f-a9aa-5d53-15ff-8fab24597ea8` | 2026-07-28 16:59 | MIXED | passed Telnyx review; **`campaignStatus: MNO_PENDING`** | none |

### #1 — verbatim reasons
> Who is the perceived sender of the messages? If it's a business using your platform, then each business will need a brand and campaign created specifically for them.
>
> Opt-in workflow mentions multiple methods of opt-in, each requiring specific details that need to be added.
>
> Please add a link/screenshot of the opt-in form to the opt-in workflow showing the phone number field and full SMS opt-in language.
>
> Privacy Policy needs to be compliant.
>
> Subscriber/Auto-response Opt-in Message needs updating.
> Subscriber/Auto-response Opt-out Message needs updating.
> Subscriber/Auto-response Help Message needs updating.

### #2 — verbatim reasons
> Support for standard help command is required by some MNOs
> Subscribers must be opted in as required by some MNOs
> Support for standard opt-out commands are required by some MNOs

### #3 — verbatim reasons
> Who is the perceived sender of the messages? … Note: The public HyveWyre website presents the service as an SMS marketing platform for agents, sales teams, and other businesses to import leads and send campaigns, including use of a shared pool of pre-verified numbers.
>
> Privacy Policy needs to be compliant. … Note: The linked privacy policy says personal information is not sold, but it does not state that mobile/SMS opt-in information will not be shared with third parties for marketing or promotional purposes.

### #6 — verbatim reasons
> The opt-in consent language does not cover all selected use cases for this campaign. Please update the consent text on your opt-in form to include all message types, or update the campaign use cases to match the consent provided.
> Note: The live opt-in form at https://hyvewyre.com/opt-in/hyvewyre-llc authorizes follow-up messages and appointment reminders, but MARKETING is selected and the campaign description includes product updates/account notifications.
>
> Subscriber/Auto-response Opt-in Message needs updating.
> Note: The START/opt-in auto-response does not explicitly mention marketing/promotional messages even though MARKETING is selected.

**Fix (commit `813d49b`):** both are the same root cause — the declared message
types have to cover *every* sub-usecase on the campaign. `buildConsentText()` now
names account notifications and promotional/marketing messages, which flows to all
three places at once (the live checkbox, the stored `consent_text` audit record, and
the `messageFlow` quoted to Telnyx). The webhook's START reply and the per-agent
campaign defaults were updated to match.

Kept MARKETING rather than narrowing the campaign — outbound prospecting is the
product, so dropping it would restrict what users can legitimately send.

Note the pre-existing "will not be shared with third parties for marketing" sentence
is about not passing the number *onward*; it authorises nothing, so it never covered
receiving promotional messages. Easy to misread as already handling this.

### #4 — verbatim reason
> Usecase LOW_VOLUME requires minimum of 1 sub-usecases

### #5 — verbatim reason
> Please add a link/screenshot of the opt-in form to the opt-in workflow showing the phone number field and full SMS opt-in language. Note: The reviewed public signup form shows a phone number field but no SMS opt-in checkbox or SMS consent language. The account onboarding path is not publicly verifiable and no screenshot of the SMS opt-in step was provided.

---

## Distinct issues → fixes

| Issue | Root cause | Fix | Where |
|---|---|---|---|
| Sender identity | Campaign described HyveWyre as a reseller platform others send through | Scope description to ONE sender; per-agent registration for real customers | `lib/telnyx10dlcDefaults.ts`, `/api/telnyx/10dlc/register` |
| Marketing copy conflict | Site advertised "shared pool of pre-verified numbers, no A2P wait" | Copy softened to describe real per-business registration | `app/(public)/preview/PreviewClient.tsx` |
| Privacy policy | Said info isn't *sold*, never said SMS opt-in isn't *shared* | Added explicit third-party sharing disclosure | `app/(public)/privacy/page.tsx` (live) |
| No consent checkbox on signup | Phone field existed with no SMS consent UI | Required checkbox + full opt-in language when phone entered | `app/auth/register/page.tsx` (live) |
| Multiple opt-in methods | messageFlow listed form OR call OR text | Describe exactly ONE method | `lib/telnyx10dlcDefaults.ts` |
| No opt-in form URL | messageFlow said "our website" generically | Include the literal opt-in URL | `lib/telnyx10dlcDefaults.ts` |
| Opt-in msg incomplete | Missing "Consent is not a condition of purchase" | Added to optinMessage | `lib/telnyx10dlcDefaults.ts` |
| Help msg vague | Said "call us or email us" with no actual contact | Real contact method required | `lib/telnyx10dlcDefaults.ts` |
| `subUsecases` missing | Omitted entirely; LOW_VOLUME requires ≥1, MIXED requires ≥2 | Always send subUsecases | `/api/telnyx/10dlc/register` |
| Keyword format | `"START, YES"` — spaces rejected (error 10015) | Comma-separated, no spaces | `lib/telnyx10dlcDefaults.ts` |

---

## Pre-submission checklist

**Use case**
- `MIXED` requires **2–5** subUsecases; `LOW_VOLUME` requires **1–5**. Never omit.
- Valid subUsecase values (confirmed via `GET /v2/10dlc/enum/usecase`): `2FA`, `MARKETING`,
  `FRAUD_ALERT`, `CUSTOMER_CARE`, `POLLING_VOTING`, `SECURITY_ALERT`, `HIGHER_EDUCATION`,
  `ACCOUNT_NOTIFICATION`, `DELIVERY_NOTIFICATION`, `PUBLIC_SERVICE_ANNOUNCEMENT`.

**messageFlow** — describe exactly ONE opt-in method, and include:
- The literal public URL of the opt-in form (screenshot only needed if behind a login)
- That the form has a phone field and a **separate, unchecked** SMS consent checkbox
- The verbatim checkbox disclaimer text
- That the checkbox is separate from any terms-of-service agreement

**optinMessage** must contain: brand · use case · message frequency · "Msg&data rates may
apply" · "Consent is not a condition of purchase" · HELP · STOP

**optoutMessage** must contain: brand · confirmation that no further messages will be sent

**helpMessage** must contain: brand · a **real** contact method (email/phone/website)

**Keywords** — comma-separated, no spaces. `subscriberOptin/Optout/Help` all `true`.

**Opt-in form itself** (`/auth/register`) must have: phone field · unchecked consent
checkbox naming the brand · frequency · rates · STOP/HELP · Privacy + Terms links ·
separate from ToS agreement · submittable without opting in.

---

## Additional findings from the pre-attempt-6 full review (2026-07-27)

- **The reviewer visits the public website.** Rejections #3 and #5 both quote things
  found on hyvewyre.com itself (the marketing copy, the signup form). Assume every
  linked URL — privacy, terms, opt-in form — and the homepage get read by a human.
- **Terms of Service had zero SMS program terms** (no frequency, rates, STOP/HELP,
  carrier disclaimer). Same gap-shape as the privacy-policy rejection. Fixed: §5a
  "SMS Messaging Terms" added to /terms.
- **HELP and START were declared but not implemented.** Every campaign declares
  help/opt-in auto-responses; the webhook only handled STOP. Rejection #2 cited
  exactly this. Fixed in the SMS webhook (exact whole-message keyword matches).
- **Checkbox text drift.** The messageFlow quote and the live opt-in page text are
  now both generated from `buildConsentText()` — byte-identical, verified by diff.
- **`vertical` is now a dropdown** of the 23 values confirmed via
  `GET /v2/10dlc/enum/vertical` — free text risked invalid submissions.
- **Auto-response spec confirmed** against the keywords/confirmation-messages
  article (previously only inferred): opt-in msg needs brand + use case + HELP +
  frequency + rates + consent-not-condition + STOP; opt-out needs brand +
  no-further-messages; help needs brand + real contact. All three comply.

## Attempt 7 — cleared Telnyx review, MNO stage still pending (2026-07-29)

Campaign `4b30019f-a9aa-5d53-15ff-8fab24597ea8` cleared Telnyx review roughly 11 hours
after submission: **`failureReasons: null`** and a real TCR campaign id **`CAAP953`**
(earlier attempts echoed the campaign UUID back in that field, which is the tell for
"not registered at TCR").

**It is not fully approved.** `campaignStatus` is **`MNO_PENDING`** — the carriers'
own stage, which follows Telnyx's review. See the status-field section below; reading
`status: ACTIVE` as approval is a mistake that has now been made twice.

**What finally fixed it** (attempt 6 → 7): the opt-in consent language and the START
auto-response were both broadened to name every declared sub-usecase, after Telnyx flagged
that the live form authorised only "follow-up messages and appointment reminders" while the
campaign declared MARKETING. Everything else was carried over unchanged — see the payload
diff in `docs/10dlc-submissions/`.

**Still to do:** the number is not automatically linked. `+18134972176` currently has
`messaging_campaign_id: null` and must be attached via Settings → Messaging Registration
("Assign my number") before it can send at 10DLC throughput. The three toll-free pool
numbers are unaffected — they run on TFV, not 10DLC.

## APPROVED — CAAP953, confirmed 2026-07-30

`4b30019f-a9aa-5d53-15ff-8fab24597ea8` / TCR `CAAP953`, registered 2026-07-28.

```
campaignStatus:      MNO_PROVISIONED
isTMobileRegistered: true
isTMobileSuspended:  false
failureReasons:      null
operationStatus:     all 7 MNOs APPROVED
```

**Only remaining step: assign a number.** `phone_number_campaigns` shows 0 assigned.

### The trap that cost a session

**Eight campaigns exist under this brand; six are dead.** CLAUDE.md named
`4b30019f-a63a-3fb0-9c87-1ff6d84e7ac6` (CJFUY00) as "the" campaign — a *superseded* attempt that
reads `TELNYX_FAILED` with real-looking failure reasons about MARKETING consent. On 2026-07-30 a
session queried that id, found it failed, and worked up an appeal and a resubmission plan for a
campaign that had already been approved a day earlier under a different id.

The failure reasons on a dead campaign stay attached forever and read exactly like current ones.
Nothing in the response says "superseded".

**Never query a campaign by an id copied from documentation.** List them and pick by status:

```
GET /10dlc/campaign?brandId=<brandId>&page=1&recordsPerPage=50
```

Take the record whose `campaignStatus` is `MNO_PROVISIONED`. That is the only one that can send.

## Reading campaign status correctly — FOUR fields, and the obvious one is wrong

`GET /10dlc/campaign/{id}` returns several status-ish fields. They mean different things and
**`status` is the least useful of them.** Reading it as "approved" has now caused two wrong
calls in this project.

| field | example | what it actually means |
|---|---|---|
| `status` | `ACTIVE` | the TCR **record** exists. Says nothing about approval — campaigns the portal shows as "Failed Telnyx Review" also report `ACTIVE`. |
| `failureReasons` | `null` | **Telnyx's own review.** Non-empty = the portal's "Failed Telnyx Review". |
| `tcrCampaignId` | `CAAP953` | a real TCR id means registration succeeded. If it equals the campaign UUID, it didn't. |
| `campaignStatus` | `MNO_PENDING` | **the carrier stage — the one that gates sending.** |

Two extra endpoints give the carrier detail:

- `GET /10dlc/campaign/{id}/operationStatus` → per-MNO approval, keyed by carrier id
- `GET /10dlc/campaign/{id}/mnoMetadata` → per-MNO throughput, message class, review flags

As of 2026-07-29 all seven carriers report `APPROVED` via `operationStatus` (AT&T,
T-Mobile, Verizon, US Cellular, Liberty, ClearSky, Interop) while `campaignStatus` still
reads `MNO_PENDING` and `isTMobileRegistered` is `false`. Those disagree, so **treat
`campaignStatus` as authoritative and wait for it to move** rather than assuming the
per-carrier view means it's done. AT&T is the only carrier publishing throughput so far
(240 TPM, message class F).

**Before declaring a campaign approved, check all four fields plus `operationStatus`.**



`GET /10dlc/campaign/{id}` returns a `status` field that is **not** the review
outcome. It reflects the TCR record's lifecycle, so a campaign the portal shows as
**"Failed Telnyx Review"** still reports `status: "ACTIVE"` over the API. On
2026-07-28 that was read as "the campaign passed" and reported as such; the portal
said otherwise.

**Check `failureReasons`.** Non-empty means Telnyx's own review rejected it, which is
what the portal renders as "Failed Telnyx Review". `Numbers: 0` on the campaign row is
a second confirmation that it isn't usable.

Also note the list endpoint requires `brandId`:
`GET /10dlc/campaign?brandId=<id>&page=1&recordsPerPage=50` — without it you get a
`10004 Missing required parameter`, and `/10dlc/campaigns` (plural) is a 404.

Campaigns are **create-only** — `OPTIONS` on a campaign returns `GET` alone, so a
rejected campaign can't be edited and every fix means a new submission via
`POST /10dlc/campaignBuilder`.

**Submission is scripted:** `scripts/submit-10dlc-campaign-attempt6.js` holds the
current payload with each historical rejection mapped to its fix inline, and a
`--dry-run` flag. Per the user (2026-07-28), a failed *Telnyx review* is not billed —
only a campaign that actually reaches the carriers is — so iterating on rejections is
cheap and shouldn't be over-thought.

## Reference docs
- Opt-in form: https://support.telnyx.com/en/articles/10684260-10dlc-opt-in-form
- Message flow field: https://support.telnyx.com/en/articles/10562019-guide-to-10dlc-message-flow-field
- Keywords/confirmations: https://support.telnyx.com/en/articles/10645338-10dlc-keywords-and-confirmation-messages
- Privacy policy: https://support.telnyx.com/en/articles/10645583-10dlc-privacy-policy

## Billing note
Account balance held at $71.23 across all 5 submissions — no charge observed despite
`billedDate` being populated on rejected campaigns. Billing timing is **not confirmed**;
watch the balance when a campaign actually resolves to ACTIVE.


---

## Cross-check: the approved campaign vs what a USER submits (2026-08-07)

Compared CAAP953's live content, field by field, against
`generateCampaignDefaults()` output for a real agent. Everything matched except
one thing, and it is the same inconsistency that caused a rejection before.

| field | approved (CAAP953) | generated for a user | verdict |
|---|---|---|---|
| `messageFlow` | opt-in URL + verbatim checkbox text | same generator, per-business slug | match |
| `optinMessage` | 305 chars, names promotional/marketing | 273 chars, names promotional/marketing | match |
| `optoutMessage` / `helpMessage` | brand + no-further-messages / brand + real contact | same | match |
| keywords, `subscriber*` flags | comma-joined, all `true` | same | match |
| `sample1` / `sample2` | follow-up, appointment reminder | same shape | match |
| **`sample3`** | **promotional message** | **absent** | **MISMATCH** |
| **`description`** | names promotional offers | listed only follow-up, scheduling, customer service | **MISMATCH** |

Both registration paths declare `MARKETING` in `subUsecases` — LOW_VOLUME gets
`['MARKETING','ACCOUNT_NOTIFICATION']`, MIXED adds `CUSTOMER_CARE`. So every user
campaign declared marketing while showing no marketing message and describing no
marketing activity.

**That is the exact shape of a previous rejection**: campaign 4b30019f was denied
on 2026-07-28 partly for omitting marketing/promotional from `optinMessage` while
MARKETING was a selected sub-use-case. The same contradiction had simply moved to
`description` and the samples.

Fixed: `sample3` is generated and submitted by both paths, and the description
names account notifications and promotional offers. Verified against the live API
— `POST /v2/10dlc/campaignBuilder` with the new payload returned **200**,
`failureReasons: null`, and stored `sample3`.

### Verified working for a user, not just for us

- `/opt-in/<slug>` resolves in production (200) and renders consent text
  **byte-identical** to what `messageFlow` quotes — the reviewer visits that URL
  and compares, and drift there is a documented rejection cause.
- The generated `description` makes the AGENT the sender and HyveWyre the vendor,
  which is the framing that fixed rejections #1 and #3.

### Still unproven, and only a real filing settles it

Mock brands and campaigns skip carrier review entirely. Everything above shows the
payload is well-formed and consistent with the one that passed. Whether TCR
*approves* a given agent's content is a human judgement about that business, and
no amount of mock testing reaches it.

Also worth knowing: **mock brand verification timing is not deterministic.** One
run went PENDING → VERIFIED in about 10 seconds; another was still unverified
after 60. Do not build timing assumptions on it.

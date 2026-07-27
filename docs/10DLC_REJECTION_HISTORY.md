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

## Reference docs
- Opt-in form: https://support.telnyx.com/en/articles/10684260-10dlc-opt-in-form
- Message flow field: https://support.telnyx.com/en/articles/10562019-guide-to-10dlc-message-flow-field
- Keywords/confirmations: https://support.telnyx.com/en/articles/10645338-10dlc-keywords-and-confirmation-messages
- Privacy policy: https://support.telnyx.com/en/articles/10645583-10dlc-privacy-policy

## Billing note
Account balance held at $71.23 across all 5 submissions — no charge observed despite
`billedDate` being populated on rejected campaigns. Billing timing is **not confirmed**;
watch the balance when a campaign actually resolves to ACTIVE.

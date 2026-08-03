# Toll-free verification — draft for review

**Not submitted.** Project rule: never submit a TFV or 10DLC request without explicit
instruction. This is a document to read, correct, and approve.

Baseline is the currently **Verified** record `6723e639-83ee-5c48-9ec7-b550fdce868c`, re-fetched
from the Telnyx API 2026-08-03. Every "current" value below is verbatim from it.

---

## The model this describes

From the decision in #129, in plain terms:

- A business signs up and gets a **toll-free number straight away**, so it can start working
  immediately instead of waiting days for its own carrier registration.
- Those toll-free numbers are **operated by HyveWyre** and covered by this verification.
- When the business's own **local number** is registered, new conversations move to it.
  Conversations already running on the toll-free stay there, so a person always hears back from
  the number they were first contacted on.
- So toll-free traffic is **new businesses in their first stretch**, not the whole customer base
  indefinitely.

That is the honest version of what the old filing tried to say, and it fixes the contradiction:
the previous text claimed one number per business forever, which the Scale tier breaks.

---

## Fields

### `useCase` — MUST CHANGE

| | |
|---|---|
| current | `Conversational / Alerts` |
| proposed | **`Mixed`** |

Businesses on the platform send marketing. Every 10DLC campaign the product registers already
declares `MARKETING` as a sub-use-case, and the consent text shown to consumers names
"promotional and marketing messages". Telnyx's own guidance: *any non-marketing content and also
marketing content → Mixed.*

**Changing this field alone is not enough** — three other fields also describe non-marketing
traffic. That mismatch is exactly what 10DLC rejection #6 cited: *"The opt-in consent language
does not cover all selected use cases."*

### `useCaseSummary` — MUST CHANGE

**Current** (describes reminders only, names two verticals, and asserts 1:1):

> HyveWyre is an ISV (Independent Software Vendor) providing a SaaS CRM platform to licensed
> insurance agents and real estate professionals. Each client business that subscribes to our
> platform is assigned their own dedicated toll-free number for sending appointment reminders,
> policy renewal notifications, and follow-up messages to their opted-in customers. HyveWyre does
> not send messages directly — our clients do, to their own customers who have provided prior
> express written consent.

**Proposed:**

> HyveWyre is an ISV providing a SaaS messaging and CRM platform to small businesses that contact
> their own customers and prospects. The platform is not specific to an industry; customers
> include insurance and real estate agencies, solar and roofing contractors, home services,
> financial services, and other small businesses that do their own outreach.
>
> Each business messages its own contacts. HyveWyre does not send messages on its own behalf to
> consumers through these numbers, and does not share contacts between businesses.
>
> Message content is a mix: follow-ups to enquiries, appointment reminders and confirmations,
> account notifications, and promotional and marketing messages. All of it is disclosed in the
> consent language a consumer agrees to.
>
> Toll-free numbers are operated by HyveWyre and assigned to a business when it joins, so it can
> begin working immediately rather than waiting for its own carrier registration. Once a business
> has its own registered local number, new conversations move to it; existing conversations
> continue on the toll-free number so a consumer always hears back from the number that first
> contacted them.

### `additionalInformation` — MUST CHANGE

**Current** — contains two statements that are not true:

> HyveWyre operates as an ISV/reseller. Each toll-free number is provisioned 1:1 to a separate,
> independent client business (e.g., one insurance agency = one toll-free number). We are
> requesting verification for multiple numbers because we onboard multiple client businesses,
> each requiring their own dedicated number. No single business uses more than one number.
> HyveWyre enforces consent requirements at the platform level before any client can send messages.

- *"No single business uses more than one number"* — the Scale tier gives a business more than one,
  for geographic coverage.
- *"HyveWyre enforces consent requirements at the platform level before any client can send"* —
  **false.** No send path reads a consent record. This was the most serious misstatement in the
  filing and it is why the public evidence page was rewritten first (#131).

**Proposed:**

> HyveWyre operates as an ISV. Each toll-free number is assigned to one business at a time and is
> never shared between businesses concurrently. A business may hold more than one number for
> geographic coverage, so that a consumer is contacted from a number local to them.
>
> Consent is obtained by each business from its own contacts. HyveWyre does not obtain consent on
> their behalf and does not represent that it verifies each contact's consent. What the platform
> does enforce, on every message and without exception, is:
>
> - suppression — an opt-out is applied immediately and permanently, checked before every
>   outbound message on every sending path, and the check fails closed: if the list cannot be
>   read, nothing is sent;
> - a deliberately broad opt-out vocabulary — STOP, UNSUBSCRIBE, QUIT, END, OPT OUT, REMOVE ME,
>   TAKE ME OFF, STOP TEXTING, and others, rather than the single required keyword;
> - HELP answered for every sender, including those who have already opted out;
> - content screening before send, with high-risk messages refused;
> - volume limits per business and per number, which tighten automatically when a business's
>   opt-out rate rises and relax as it recovers.
>
> A business cannot remove, override or work around a suppression. Businesses accept
> responsibility for the lawful basis of their contacts in our terms of service, and record a
> dated attestation when adding contacts they hold outside the platform.

### `productionMessageContent` — SHOULD CHANGE

| | |
|---|---|
| current | `Hi {FirstName}, this is {AgentName} from {AgencyName}. Reminder: You have an appointment scheduled for {Date} at {Time}. Reply STOP to opt out. Msg & data rates may apply.` |

That is a reminder, and reminders are the minority of what is sent. Proposed — taken from the
industry templates the product actually ships, plus the opt-out footer the platform appends to a
first message:

> Hi {FirstName}, this is {AgentName} with {BusinessName}. I'm following up on your request for a
> quote. Do you have a few minutes to go over your options?
>
> Reply STOP to opt out

### `optInWorkflow` — MUST CHANGE

**Current** — accurate about the branded form, but describes it as the only way contacts arrive,
and puts it on the business's own website:

> Customers complete a web form on the agent's website with a required unchecked checkbox stating:
> "I agree to receive SMS messages from {AgencyName}. Msg frequency varies. Msg & data rates may
> apply. Reply STOP to unsubscribe." Only contacts who check the box are added. Consent is logged
> with timestamp, phone number, and source URL.

Three problems: the form is hosted by HyveWyre, not the business; the quoted disclosure is out of
date and omits marketing; and there is no source-URL column — what is stored is the IP, user
agent, timestamp and the verbatim disclosure text.

**Proposed:**

> Consent is collected in two ways, and both are recorded.
>
> **1 — Hosted opt-in form.** HyveWyre hosts a branded page for each business at
> hyvewyre.com/opt-in/{business}. A consumer enters their details and must tick a box that is
> unchecked by default and reads:
>
> "I agree to receive SMS text messages from {BusinessName} at the phone number provided,
> including follow-up messages, appointment reminders, account notifications, and promotional and
> marketing messages. Message and data rates may apply. Message frequency varies. Consent is not
> a condition of purchase. Your mobile opt-in information will not be shared with third parties
> for marketing or promotional purposes. Reply STOP to opt out at any time, HELP for help."
>
> The form cannot be submitted without ticking it. On submission we store the phone number, the
> UTC timestamp, the originating IP address, the browser user agent, and a verbatim copy of the
> disclosure text as it was shown, so the exact wording any individual consumer agreed to can be
> reproduced.
>
> **2 — Contacts the business already holds.** Businesses bring existing customers and enquiries
> obtained through their own websites, forms and enquiries before joining the platform. When
> adding these, the business must affirm — in a control that cannot be skipped, recorded with its
> date — that each contact has given prior express written consent to receive SMS from that
> business, that it can produce evidence on request, and that it is responsible for the lawful
> basis on which they are contacted. The consent evidence itself is held by the business.

### `optInConfirmationResponse` — NEEDS A DECISION

| | |
|---|---|
| current | `You are now subscribed to messages from {AgencyName}. Msg frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for info.` |

**The product does not send this.** Completing the hosted form records consent and creates the
contact; no message goes out. Declaring it would be the same class of misstatement that #131 just
removed from the public evidence page.

Two ways forward:

1. **Implement it** — one message when the hosted form is completed. Standard practice, confirms
   to the consumer that consent registered, and lets the field stay. Small change.
2. **Remove the claim** — accurate, but a reviewer expects a confirmation, and its absence invites
   a question.

**Recommendation: implement it**, and keep wording close to the current text.

### `helpMessageResponse` — SHOULD CHANGE

| | |
|---|---|
| current | `For support, contact your agent directly. Reply STOP to unsubscribe. Msg & data rates may apply.` |
| shipped | `{BusinessName}: For help, contact {business email}. Reply STOP to unsubscribe. Msg&data rates may apply.` |

The shipped reply is better than the declared one — it names the business and gives a real
contact. Quote what actually goes out.

### `phoneNumbers` — MUST CHANGE

Approved for five; **three exist**: `+18887062631`, `+18886638510`, `+18884610148`.
`+18886642550` and `+18884080726` are gone.

> ⚠️ All three show `purchased_at` 2026-07-26 — **six months after this verification was granted
> on 2026-01-16.** Either they were released and re-acquired, or the numbers now held are not the
> ones verified. **Only you can resolve this**, and it should be settled before submitting
> anything, because it determines whether this is an amendment or a fresh request.

### `messageVolume` — NEEDS YOUR INPUT

**Answered 2026-08-03: 100–1,000 businesses in 12 months, one number each.**

Proposed `messageVolume`: **500,000** per month. Basis: credits cap a Growth account at 3,000
messages a month, so ~165 active businesses at full usage. That covers the near end of the range
with headroom, and is far more defensible than the current `10,000` against zero actual traffic.

**This is the hard part of the filing.** 100–1,000 businesses means 100–1,000 toll-free numbers.
Telnyx caps at 5 per business without justification — that cap is what rejected `65ad888e`. The
ISV argument has to carry the whole request, and numbers will come in reviewed batches (#3).

### Unchanged, pending your confirmation

`businessName` HyveWyre LLC · `doingBusinessAs` HyveWyre · `entityType` PRIVATE_PROFIT ·
`businessRegistrationNumber` 41-2842279 (EIN) · `12325 Magnolia Street, San Antonio, FL 33576` ·
contact **Carson Rios** (see note) · `corporateWebsite`
https://www.hyvewyre.com · `privacyPolicyURL` /privacy · `termsAndConditionURL` /terms ·
`ageGatedContent` false · `optInKeywords` START · `isvReseller` HyveWyre LLC

**Contact, answered 2026-08-03:** the LLC is registered in Carson Rios's name; Tripp Browning is
majority owner. Either can be the authorised contact. Recommend leaving **Carson Rios** on the
filing so it matches the registration Telnyx can verify, and adding Tripp as a second contact if
the form allows one.

The evidence page footer gives **support@hyvewyre.com** while the filing gives **business@** —
these should agree. The product accepts START, UNSTOP and YES; declaring only START is fine,
since supporting more than declared is not a misstatement.

---

## Before this can be submitted

**Answered 2026-08-03:** contact (Carson on the filing, Tripp as owner) · volume (100–1,000
businesses, one number each) · verticals (not industry-specific).

**Still open**

1. Legal name, EIN and address unchanged? `business@` or `support@` as the contact email?
2. **The phone numbers.** All three were purchased 2026-07-26; this verification was granted
   2026-01-16. Released and re-bought, or were these never the verified set?
3. Opt-in confirmation SMS — implement it, or drop the claim? (recommend: implement)
4. **Ask Telnyx:** can a Verified request be amended in place, or does this mean a new
   submission — and do the three numbers keep sending while a replacement is reviewed? Getting
   this wrong could take your only sending capability offline.

---

## Already done, so this filing can be truthful

- `/opt-in-proof.png` — the evidence URL in this filing — rewritten so every claim is true (#131)
- `/terms` and `/compliance` corrected (#131)
- Every first message now carries opt-out instructions on every marketing path (#131)
- Consent provenance recorded on every contact, with attestation required on import and manual
  entry (#130)
- Opt-out enforcement, content screening and automatic volume limits are all real and can be
  described without overstating (#123)

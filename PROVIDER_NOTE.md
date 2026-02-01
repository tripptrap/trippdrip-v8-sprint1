# HyveWyre Telephony Provider: Telnyx

This project uses **Telnyx** as its SMS and voice provider — **not Twilio**.

## Legacy Twilio References

Legacy Twilio code still exists in approximately 66 files across the codebase. These references have not been removed to avoid unnecessary churn, but they should **not** be used for new work.

Key areas where Twilio references remain:

- `lib/` — helper modules and client wrappers
- `app/api/twilio/` — legacy webhook and API routes
- `scripts/` — maintenance and migration scripts
- SQL migrations — schema references and seed data
- `docs/` — older documentation

## Guidance for New Work

All new telephony features (SMS, voice, number management, etc.) must use the **Telnyx APIs and SDKs**. Do not introduce new Twilio dependencies or extend legacy Twilio code paths.

---

## Work Log

### 2026-02-01 — Session 1: Codebase Assessment & Provider Clarification

**What we did:**
- Navigated and assessed the full trippdrip-v8-sprint1 project (Next.js codebase)
- Discovered ~66 files still referencing Twilio across `lib/`, `app/api/twilio/`, `scripts/`, SQL migrations, and `docs/`
- Identified key Twilio files: `twilio.ts`, `twilioClient.ts`, `twilioSubaccounts.ts`, `twilioUsage.ts`, plus ~14 API routes under `app/api/twilio/`
- Confirmed the actual provider is **Telnyx**, not Twilio
- Decided against deleting legacy Twilio code to avoid breaking anything
- Created this `PROVIDER_NOTE.md` file as a reference point

**What's next:**
- Begin migrating Twilio references to Telnyx where appropriate
- Prioritize active code paths (API routes, lib clients) over inactive ones (old docs, migrations)
- Build out new telephony features using Telnyx SDKs/APIs
- Gradually retire legacy Twilio routes and helpers as Telnyx replacements are confirmed working

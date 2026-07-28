#!/usr/bin/env node
/**
 * 10DLC campaign submission — attempt 6, prepared 2026-07-28.
 *
 * Every prior attempt's rejection reason was pulled from the live Telnyx API
 * and cross-referenced; this payload addresses all of them. See
 * docs/10DLC_REJECTION_HISTORY.md for the running log.
 *
 *   run:  node scripts/submit-10dlc-campaign-attempt6.js
 *   dry:  node scripts/submit-10dlc-campaign-attempt6.js --dry-run
 *
 * THIS PLACES A REAL SUBMISSION AND MAY INCUR A CARRIER FEE. Run it only when
 * you actually intend to submit.
 *
 * ── What each historical rejection was, and how this payload answers it ──────
 *
 * 1. "Who is the perceived sender?"  (raised 2026-07-26 and 2026-07-27)
 *    -> `description` states the campaign covers ONLY HyveWyre LLC's own
 *       first-party messages, and that platform customers register their own
 *       separate brand + campaign.
 *
 * 2. "Opt-in workflow mentions multiple methods"  (2026-07-26)
 *    -> `messageFlow` describes exactly one method and says so explicitly.
 *
 * 3. "Add a link/screenshot of the opt-in form"  (2026-07-26, 2026-07-27)
 *    -> `messageFlow` links https://hyvewyre.com/opt-in/hyvewyre-llc, which is
 *       publicly reachable and shows the phone field plus the unchecked consent
 *       checkbox. (The 2026-07-27 rejection was against the *signup* form,
 *       which had no consent language — the dedicated opt-in page fixed that.)
 *
 * 4. "Privacy Policy needs to be compliant"  (2026-07-26, 2026-07-27)
 *    -> Verified live 2026-07-28: hyvewyre.com/privacy states "Text messaging
 *       originator opt-in data and consent are not shared with any third
 *       parties for promotional or marketing purposes."
 *
 * 5. "Usecase LOW_VOLUME requires minimum of 1 sub-usecases"  (2026-07-27)
 *    -> MIXED with three sub-usecases.
 *
 * 6. "Opt-in consent language does not cover all selected use cases"  (2026-07-28)
 *    -> The consent text now names account notifications and promotional /
 *       marketing messages, covering all three sub-usecases. The string below
 *       is quoted VERBATIM from the live form — Telnyx compares them, so if
 *       lib/optInConsent.ts changes, this must change with it.
 *
 * 7. "Subscriber/Auto-response Opt-in Message needs updating"  (2026-07-26, 2026-07-28)
 *    -> `optinMessage` now names every message type the campaign declares.
 */

// Resolve .env.local from the repo root, not process.cwd(), so this runs from
// any directory.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const key = process.env.TELNYX_API_KEY;

// Must match lib/optInConsent.ts buildConsentText('HyveWyre LLC') exactly,
// which is what renders on the live opt-in page.
const CONSENT =
  'I agree to receive SMS text messages from HyveWyre LLC at the phone number provided, ' +
  'including follow-up messages, appointment reminders, account notifications, and ' +
  'promotional and marketing messages. Message and data rates may apply. ' +
  'Message frequency varies. Consent is not a condition of purchase. Your mobile opt-in ' +
  'information will not be shared with third parties for marketing or promotional purposes. ' +
  'Reply STOP to opt out at any time, HELP for help.';

const payload = {
  brandId: '4b20019b-eba4-6bfd-8723-dca9058142e8', // HyveWyre LLC, VERIFIED
  usecase: 'MIXED',
  subUsecases: ['ACCOUNT_NOTIFICATION', 'MARKETING', 'CUSTOMER_CARE'],

  description:
    "HyveWyre LLC operates hyvewyre.com, a SaaS platform for SMS lead management. This " +
    "campaign covers only HyveWyre LLC's own first-party messages to consumers who opted " +
    "in on HyveWyre's own web form — account notifications, onboarding help, follow-ups, " +
    "product updates, and promotional offers about HyveWyre's own service. Businesses that " +
    "use the HyveWyre platform to message their own customers are not covered by this " +
    "campaign; each such business registers its own separate 10DLC brand and campaign.",

  messageFlow:
    'Consumers opt in through the lead form at https://hyvewyre.com/opt-in/hyvewyre-llc. ' +
    'The form includes a phone number field and a separate, unchecked SMS consent checkbox ' +
    'reading verbatim: "' + CONSENT + '" The checkbox links to the Privacy Policy and Terms ' +
    'of Service, is separate from any terms-of-service agreement, and the form can be ' +
    'submitted without opting in to SMS. HyveWyre LLC then follows up by SMS only with ' +
    'consumers who checked that box. This is the only opt-in method for this campaign.',

  sample1:
    'Hi {name}, this is HyveWyre LLC! Thanks for reaching out about SMS lead management ' +
    'software. Do you have a few minutes to chat about your options? Reply STOP to opt out.',
  sample2:
    'Hi {name}, this is a reminder from HyveWyre LLC about your upcoming appointment on ' +
    '{date} at {time}. Reply YES to confirm or call us to reschedule. Reply STOP to opt out.',
  // Added so each declared sub-usecase has a representative sample — MARKETING
  // was declared with no promotional example in earlier attempts.
  sample3:
    'HyveWyre LLC: Save 20% on your first 3 months when you upgrade to Scale before Friday. ' +
    'Reply STOP to opt out, HELP for help.',

  optinKeywords: 'START,YES,UNSTOP',
  optinMessage:
    'You are now opted in to receive SMS messages from HyveWyre LLC, including follow-ups, ' +
    'appointment reminders, account notifications, and promotional and marketing messages. ' +
    'Message frequency varies. Msg&data rates may apply. Consent is not a condition of ' +
    'purchase. Reply HELP for help, STOP to unsubscribe.',

  optoutKeywords: 'STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT',
  optoutMessage:
    'You have been unsubscribed from HyveWyre LLC SMS messages and will not receive any ' +
    'more messages. Reply START to resubscribe.',

  helpKeywords: 'HELP,INFO',
  helpMessage:
    'HyveWyre LLC: For help, contact support@hyvewyre.com. Reply STOP to unsubscribe. ' +
    'Msg&data rates may apply.',

  subscriberOptin: true,
  subscriberOptout: true,
  subscriberHelp: true,
  numberPool: false,
  embeddedLink: false,
  embeddedPhone: false,
  ageGated: false,
  directLending: false,
  privacyPolicyLink: 'https://hyvewyre.com/privacy',
  termsAndConditionsLink: 'https://hyvewyre.com/terms',
};

async function main() {
  if (!key) {
    console.error('TELNYX_API_KEY not set — check .env.local');
    process.exit(1);
  }

  console.log(JSON.stringify(payload, null, 2));

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing submitted.');
    return;
  }

  console.log('\nSubmitting to Telnyx…');
  const res = await fetch('https://api.telnyx.com/10dlc/campaignBuilder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  console.log('HTTP', res.status);
  console.log('campaignId    :', data.campaignId ?? data.id ?? '(none)');
  console.log('status        :', data.campaignStatus ?? data.status ?? '(none)');
  console.log('failureReasons:', JSON.stringify(data.failureReasons ?? null, null, 2));

  if (!res.ok) console.log('RAW:', JSON.stringify(data, null, 2));

  console.log(
    '\nNOTE: a `status` of ACTIVE only means the record was created at TCR. ' +
    'Telnyx\'s own review is separate — check `failureReasons`, which is what the ' +
    'portal shows as "Failed Telnyx Review".'
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

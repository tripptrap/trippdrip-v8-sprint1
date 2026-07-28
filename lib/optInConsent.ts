// Single source of truth for SMS opt-in consent wording.
//
// The SAME string must appear in three places or a 10DLC campaign gets denied:
//   1. The checkbox a consumer actually sees on /opt-in/<slug>
//   2. The consent_text audit record stored when they submit
//   3. The campaign's messageFlow field, quoted verbatim to Telnyx
// Keeping one generator prevents those three drifting apart.
//
// Required elements (per Telnyx; see docs/10DLC_REJECTION_HISTORY.md):
//   brand name · message types · frequency · rates · "Consent is not a
//   condition of purchase" · third-party sharing · STOP · HELP
//
// The listed message types MUST cover every sub-use-case on the campaign.
// Telnyx flagged exactly this on campaign 4b30019f (2026-07-28): the form
// authorised "follow-up messages and appointment reminders" while the campaign
// declared ACCOUNT_NOTIFICATION, MARKETING and CUSTOMER_CARE — so the consent
// didn't cover MARKETING. If a sub-use-case is ever added to the campaign, this
// sentence has to grow with it.
//
// Note the third-party sentence is about not *sharing* the consumer's number
// onward; it doesn't authorise anything, so it can't stand in for naming
// promotional messages as a type the consumer will receive.

export function buildConsentText(businessName: string, whatTheyOffer?: string): string {
  const business = businessName.trim() || 'this business';
  const about = whatTheyOffer?.trim() ? ` about ${whatTheyOffer.trim()}` : '';
  return (
    `I agree to receive SMS text messages from ${business}${about} at the phone number provided, ` +
    `including follow-up messages, appointment reminders, account notifications, and ` +
    `promotional and marketing messages. Message and data rates may apply. ` +
    `Message frequency varies. Consent is not a condition of purchase. Your mobile opt-in ` +
    `information will not be shared with third parties for marketing or promotional purposes. ` +
    `Reply STOP to opt out at any time, HELP for help.`
  );
}

/** Turns a business name into a URL-safe slug for its public opt-in page. */
export function slugifyBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

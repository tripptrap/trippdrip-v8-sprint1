// Default 10DLC campaign content generator.
//
// Every default here encodes a lesson from a real Telnyx/TCR rejection —
// see docs/10DLC_REJECTION_HISTORY.md for the full log of what was submitted
// and why each attempt was denied. Read that before changing any of this.
//
// Load-bearing rules baked in below:
//   1. The SPECIFIC business is always the sender; HyveWyre is only the
//      platform/vendor. (Rejections #1, #3 — "who is the perceived sender?")
//   2. messageFlow describes exactly ONE opt-in method and links the actual
//      opt-in URL. (Rejections #1, #5 — multiple methods / no form link)
//   3. optinMessage must carry brand, use case, frequency, rates, HELP, STOP,
//      AND "Consent is not a condition of purchase". (Rejections #1, #2)
//   4. helpMessage must name a REAL contact method, not "call us".
//   5. Keywords are comma-separated with NO spaces (Telnyx error 10015).
//   6. The checkbox text QUOTED in messageFlow must byte-for-byte match the
//      checkbox actually rendered on the opt-in page — reviewers visit the
//      URL and compare. Both therefore come from buildConsentText().

import { buildConsentText } from './optInConsent';

export interface CampaignDefaultsInput {
  legalBusinessName: string;
  vertical: string;
  whatTheyOffer?: string; // e.g. "home and auto insurance quotes"
  /** Public URL of the business's own opt-in form. Telnyx requires this. */
  optInUrl?: string;
  /** Real contact method for the HELP reply — email, phone, or website. */
  helpContact?: string;
}

export interface CampaignDefaults {
  description: string;
  sample1: string;
  sample2: string;
  messageFlow: string;
  helpMessage: string;
  optinMessage: string;
  optoutMessage: string;
  optinKeywords: string;
  optoutKeywords: string;
  helpKeywords: string;
}

export function generateCampaignDefaults(input: CampaignDefaultsInput): CampaignDefaults {
  const business = input.legalBusinessName.trim();
  const offer = input.whatTheyOffer?.trim() || `${input.vertical.toLowerCase()} services`;
  const optInUrl = input.optInUrl?.trim();
  const helpContact = input.helpContact?.trim();

  // ONE opt-in method only — Telnyx explicitly rejects flows listing several.
  // Web form is the primary/default method; the URL is required evidence.
  const optInLocation = optInUrl
    ? `the lead form at ${optInUrl}`
    : `${business}'s website lead form`;

  return {
    description: `${business} uses HyveWyre, a third-party SMS platform, to text their own leads and customers about ${offer}. Messages include lead follow-up, appointment scheduling, and customer service — sent only to people who have opted in through ${business}'s own web form.`,
    sample1: `Hi {name}, this is ${business}! Thanks for reaching out about ${offer}. Do you have a few minutes to chat about your options? Reply STOP to opt out.`,
    sample2: `Hi {name}, this is a reminder from ${business} about your upcoming appointment on {date} at {time}. Reply YES to confirm or call us to reschedule. Reply STOP to opt out.`,
    messageFlow: `Consumers opt in through ${optInLocation}. The form includes a phone number field and a separate, unchecked SMS consent checkbox reading verbatim: "${buildConsentText(business)}" The checkbox links to the Privacy Policy and Terms of Service, is separate from any terms-of-service agreement, and the form can be submitted without opting in to SMS. ${business} then uses HyveWyre to follow up by SMS only with consumers who checked that box.`,
    helpMessage: helpContact
      ? `${business}: For help, contact ${helpContact}. Reply STOP to unsubscribe. Msg&data rates may apply.`
      : `${business}: For help, reply to this message or visit our website. Reply STOP to unsubscribe. Msg&data rates may apply.`,
    optinMessage: `You are now opted in to receive SMS messages from ${business} about ${offer}. Message frequency varies. Msg&data rates may apply. Consent is not a condition of purchase. Reply HELP for help, STOP to unsubscribe.`,
    optoutMessage: `You have been unsubscribed from ${business} SMS messages and will not receive any more messages. Reply START to resubscribe.`,
    optinKeywords: 'START,YES,UNSTOP',
    optoutKeywords: 'STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT',
    helpKeywords: 'HELP,INFO',
  };
}

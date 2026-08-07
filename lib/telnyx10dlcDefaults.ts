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

/** Telnyx caps optinMessage at 320 chars (error 10025, `/body/optinMessage`). */
export const OPTIN_MESSAGE_MAX = 320;

/**
 * The opt-in auto-reply, guaranteed to fit Telnyx's 320-character limit.
 *
 * Found by a mock-brand run (#1): the generated message was 343 characters and
 * **every** campaign submission would have failed with 10025 — after the $4.50
 * brand charge had already gone through. The approved campaign CAAP953 is 305,
 * which is why this was never hit by the one registration that exists.
 *
 * What cannot be dropped to save room:
 *   - the business name — it is the perceived sender (rejections #1, #3)
 *   - every message type the campaign declares. Campaign 4b30019f was rejected
 *     on 2026-07-28 partly for omitting marketing/promotional while MARKETING
 *     was a selected sub-use-case.
 *   - frequency, rates, "Consent is not a condition of purchase", HELP, STOP
 *
 * What was dropped: the `about <offer>` clause. The approved campaign does not
 * carry it, so its absence is known-good with the reviewers.
 *
 * Length still scales with the legal business name, and the full form only
 * leaves room for about 27 characters of it — so a compact form follows, and
 * past that the name itself is trimmed. A truncated name in one auto-reply is a
 * better outcome than a registration that cannot be submitted at all.
 */
export function buildOptinMessage(business: string): string {
  const full = (b: string) =>
    `You are now opted in to receive SMS messages from ${b}, including follow-ups, appointment reminders, account notifications, and promotional and marketing messages. Message frequency varies. Msg&data rates may apply. Consent is not a condition of purchase. Reply HELP for help, STOP to unsubscribe.`;

  const compact = (b: string) =>
    `You are now opted in to SMS from ${b}: follow-ups, appointment reminders, account notifications, and marketing messages. Frequency varies. Msg&data rates may apply. Consent is not a condition of purchase. Reply HELP for help, STOP to unsubscribe.`;

  const name = business.trim();
  if (full(name).length <= OPTIN_MESSAGE_MAX) return full(name);
  if (compact(name).length <= OPTIN_MESSAGE_MAX) return compact(name);

  // Still over: trim the name against the compact form, leaving room for '…'.
  const overflow = compact(name).length - OPTIN_MESSAGE_MAX;
  const trimmed = name.slice(0, Math.max(1, name.length - overflow - 1)).trimEnd() + '…';
  return compact(trimmed);
}

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
  /**
   * A promotional sample. Required in practice, not by the API.
   *
   * Both LOW_VOLUME and MIXED registrations declare MARKETING in `subUsecases`
   * (see /api/telnyx/10dlc/register), and a reviewer checks that the declared
   * use cases are actually demonstrated. The approved campaign CAAP953 carries
   * exactly three samples — follow-up, appointment reminder, and a promotional
   * one — while this generator produced only the first two.
   *
   * That mismatch is a known rejection shape here: campaign 4b30019f was denied
   * on 2026-07-28 partly for omitting marketing/promotional from the opt-in
   * message while MARKETING was a selected sub-use-case. Declaring MARKETING and
   * showing no marketing message is the same inconsistency in a different field.
   */
  sample3: string;
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
    // Every declared sub-use-case must appear here. The registration declares
    // MARKETING for both LOW_VOLUME and MIXED, and this used to describe only
    // "lead follow-up, appointment scheduling, and customer service" — a
    // description that contradicts its own campaign. The approved campaign names
    // promotional messages explicitly.
    description: `${business} uses HyveWyre, a third-party SMS platform, to text their own leads and customers about ${offer}. Messages include lead follow-up, appointment scheduling, customer service, account notifications, and promotional offers about ${business}'s own services — sent only to people who have opted in through ${business}'s own web form.`,
    sample1: `Hi {name}, this is ${business}! Thanks for reaching out about ${offer}. Do you have a few minutes to chat about your options? Reply STOP to opt out.`,
    sample2: `Hi {name}, this is a reminder from ${business} about your upcoming appointment on {date} at {time}. Reply YES to confirm or call us to reschedule. Reply STOP to opt out.`,
    // The MARKETING sample. Mirrors the approved campaign's third sample: names
    // the brand first, makes a plainly promotional offer, and carries both STOP
    // and HELP.
    sample3: `${business}: New ${offer} options are available this month — reply YES and we'll send you a personalized quote. Reply STOP to opt out, HELP for help.`,
    messageFlow: `Consumers opt in through ${optInLocation}. The form includes a phone number field and a separate, unchecked SMS consent checkbox reading verbatim: "${buildConsentText(business)}" The checkbox links to the Privacy Policy and Terms of Service, is separate from any terms-of-service agreement, and the form can be submitted without opting in to SMS. ${business} then uses HyveWyre to follow up by SMS only with consumers who checked that box.`,
    helpMessage: helpContact
      ? `${business}: For help, contact ${helpContact}. Reply STOP to unsubscribe. Msg&data rates may apply.`
      : `${business}: For help, reply to this message or visit our website. Reply STOP to unsubscribe. Msg&data rates may apply.`,
    // Must name every message type the campaign declares — Telnyx rejected
    // campaign 4b30019f on 2026-07-28 partly because this response omitted
    // marketing/promotional while MARKETING was a selected sub-use-case.
    //
    // Hard-capped at 320 characters by the API (`/body/optinMessage`, error
    // 10025) — the only campaign field with that limit; messageFlow is not
    // capped, the approved campaign's is 944. See buildOptinMessage.
    optinMessage: buildOptinMessage(business),
    optoutMessage: `You have been unsubscribed from ${business} SMS messages and will not receive any more messages. Reply START to resubscribe.`,
    optinKeywords: 'START,YES,UNSTOP',
    optoutKeywords: 'STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT',
    helpKeywords: 'HELP,INFO',
  };
}

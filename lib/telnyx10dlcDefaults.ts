// Default 10DLC campaign content generator.
//
// The pilot campaign that got rejected described HyveWyre itself as the
// sender ("HyveWyre, a technology company") instead of the actual business
// using the platform. These defaults always frame the SPECIFIC business as
// the sender and HyveWyre only as the SMS platform/vendor they use — the
// framing TCR expects for an ISV/reseller setup.

export interface CampaignDefaultsInput {
  legalBusinessName: string;
  vertical: string;
  whatTheyOffer?: string; // e.g. "home and auto insurance quotes"
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

  return {
    description: `${business} uses HyveWyre, a third-party SMS platform, to text their own leads and customers about ${offer}. Messages include lead follow-up, appointment scheduling, and customer service — sent only to people who have opted in by submitting a form, calling, or texting ${business} directly.`,
    sample1: `Hi {name}, this is ${business}! Thanks for reaching out about ${offer}. Do you have a few minutes to chat about your options? Reply STOP to opt out.`,
    sample2: `Hi {name}, this is a reminder from ${business} about your upcoming appointment on {date} at {time}. Reply YES to confirm or call us to reschedule. Reply STOP to opt out.`,
    messageFlow: `Contacts opt in by submitting a lead form on ${business}'s website, calling ${business} directly, or texting ${business}'s number first. ${business} then uses HyveWyre to follow up by SMS. Message and data rates may apply. Message frequency varies. Reply STOP to opt out at any time, HELP for help.`,
    helpMessage: `${business}: For help, call us or email us. Reply STOP to unsubscribe. Msg&data rates may apply.`,
    optinMessage: `You are now opted in to receive SMS messages from ${business}. Message and data rates may apply. Message frequency varies. Reply STOP to unsubscribe, HELP for help.`,
    optoutMessage: `You have been unsubscribed from ${business} SMS messages and will not receive any more messages. Reply START to resubscribe.`,
    optinKeywords: 'START, YES, UNSTOP',
    optoutKeywords: 'STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT',
    helpKeywords: 'HELP, INFO',
  };
}

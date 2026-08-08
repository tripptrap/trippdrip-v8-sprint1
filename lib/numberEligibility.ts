/**
 * Whether a user is allowed to take a phone number yet (#1).
 *
 * Onboarding lets someone finish signup without an EIN, because demanding a tax
 * ID before the account exists loses people who are still deciding. The cost of
 * that leniency is that the account exists in a state where a number would be
 * useless: numbers carry A2P traffic, A2P traffic needs a 10DLC campaign, and a
 * campaign needs a verified brand — which needs the EIN.
 *
 * Handing out a number before then produces the worst possible failure: the user
 * has a number, the app looks finished, and every message they send is filtered
 * by carriers with no error surfaced anywhere. Better to withhold the number and
 * say exactly why.
 *
 * `reason` is written to be shown to the user as-is. `code` is for the UI to
 * decide where to send them.
 */

export type NumberGateCode =
  | 'no_registration'
  | 'missing_ein'
  | 'not_submitted'
  | 'brand_failed';

export type NumberGate =
  | { allowed: true }
  | { allowed: false; code: NumberGateCode; reason: string };

/** Message shown when a gate blocks a number. Kept here so API and UI agree. */
export const GATE_MESSAGES: Record<NumberGateCode, string> = {
  no_registration:
    'Add your business details before claiming a number. Carriers require a registered business behind every number that sends marketing texts.',
  missing_ein:
    'Add your EIN to finish business registration. Carriers require it before a number can send messages, so numbers stay unavailable until it is on file.',
  not_submitted:
    'Your business details are saved but not yet submitted for carrier registration. Finish registration to claim a number.',
  brand_failed:
    'Carrier verification of your business was not successful, so numbers cannot be issued yet. Check your business details and resubmit.',
};

/**
 * @param supabase a **service-role** client — `user_10dlc_registrations` is not
 *                 readable by the user's own client.
 */
export async function checkNumberEligibility(
  supabase: any,
  userId: string,
  opts: { numberType?: 'tollfree' | 'local' } = {}
): Promise<NumberGate> {
  // ── Toll-free is not 10DLC ──────────────────────────────────────────────────
  //
  // Everything this gate checks — EIN, brand, campaign — is the **10DLC** path,
  // which governs long codes. A toll-free number is authorised by Toll-Free
  // Verification instead, and the shared pool numbers are already verified under
  // HyveWyre's own request. Demanding an EIN before handing one out withheld a
  // number for a reason that does not apply to it.
  //
  // The product said so on the same screen: /phone-numbers offers "claim a
  // pre-verified number from our shared pool and send messages immediately - no
  // waiting for verification", and clicking Claim returned 403 "Add your EIN".
  //
  // The real risk with pool numbers is not registration, it is that they send
  // under OUR verification — so one bad account can cost every account on the
  // pool. That is a volume problem, not an onboarding one, and it is answered by
  // the provisional cap below plus the tighter shared-number risk thresholds
  // already in lib/riskTier, not by a gate that stops honest users starting.
  if (opts.numberType === 'tollfree') {
    return { allowed: true };
  }

  const { data: reg, error } = await supabase
    .from('user_10dlc_registrations')
    .select('tax_id, entity_type, brand_id, brand_status')
    .eq('user_id', userId)
    .maybeSingle();

  // Fail closed. A read that errored is not evidence of eligibility, and the
  // consequence of guessing "allowed" is a number that silently cannot send.
  if (error) {
    console.error(`checkNumberEligibility: could not read registration for ${userId}:`, error);
    return { allowed: false, code: 'no_registration', reason: GATE_MESSAGES.no_registration };
  }

  if (!reg) {
    return { allowed: false, code: 'no_registration', reason: GATE_MESSAGES.no_registration };
  }

  // Sole proprietor used to be exempt from the EIN check, on the grounds that
  // Telnyx registers them with an SSN instead. The exemption is gone and stays
  // gone: sole props are supported again (#194) and they do supply an EIN — the
  // IRS issues one to an individual with no company, which is the whole basis of
  // that path. So the requirement below applies to every entity type, and no
  // registration can pass this gate without the field that starts the carrier
  // clock.
  if (!reg.tax_id?.trim()) {
    return { allowed: false, code: 'missing_ein', reason: GATE_MESSAGES.missing_ein };
  }

  // A brand id is the proof that the details actually reached Telnyx. Details
  // sitting in our database have not started the 3–7 day carrier clock.
  if (!reg.brand_id) {
    return { allowed: false, code: 'not_submitted', reason: GATE_MESSAGES.not_submitted };
  }

  if (reg.brand_status === 'failed') {
    return { allowed: false, code: 'brand_failed', reason: GATE_MESSAGES.brand_failed };
  }

  // Deliberately *not* requiring brand_status === 'verified' or an approved
  // campaign. Verification takes 3–7 business days, and blocking that long
  // means a paying user sits with nothing. Once the submission is in, the
  // number can be provisioned and attached; assignment to the campaign happens
  // automatically when it is approved (#107).
  return { allowed: true };
}

/**
 * Send allowance for an account that has not completed its own 10DLC
 * registration.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Toll-free pool numbers no longer require registration to claim (see above), so
 * a brand-new account can send within minutes. Good — that is the product's
 * promise. But those numbers send under **HyveWyre's** Toll-Free Verification,
 * not the user's, so a single abusive account puts the verification behind every
 * pool number at risk simultaneously.
 *
 * The answer is a ceiling, not a gate. Someone evaluating the product needs tens
 * of messages, not thousands; someone who needs thousands has a business worth
 * registering. So the cap is set where a genuine trial never notices it and bulk
 * abuse hits it in the first minutes.
 *
 * It lifts by itself the moment registration is submitted — the same trigger
 * that already unlocks local numbers. Nobody has to ask.
 *
 * This composes with, and does not replace, the tighter shared-number risk
 * thresholds in lib/riskTier: this bounds how much damage is possible before the
 * risk signals have enough data to say anything, and those take over after.
 */
export const PROVISIONAL_LIMITS = {
  // The daily total is the cap. The per-minute and per-hour figures match what a
  // fully registered account gets, deliberately — throttling the *shape* of the
  // traffic as well as its volume would make an unregistered account feel broken
  // rather than bounded, and the thing being protected is the daily footprint on
  // a shared number, not the burst rate.
  maxMessagesPerMinute: 10,
  maxHourlyMessages: 100,
  /**
   * Strict: never exceeded, and never raised by anything the account can set.
   *
   * Applied with Math.min against the account's own settings, so a user can
   * choose something lower but nothing can choose higher. The risk tier can
   * reduce it further while an account's opt-out rate is elevated, and does so
   * automatically in both directions.
   *
   * Raised from 50 on request. 50 was set for "someone evaluating the product";
   * 500 is a working day of real outreach, which is the actual job. The exposure
   * that comes with it is real and worth naming: pool numbers send under
   * HyveWyre's own Toll-Free Verification, so this is the volume an unregistered
   * account can put against our verification before it registers. With two pool
   * numbers that is up to 1,000 messages a day of unregistered traffic.
   *
   * What contains it is not this number alone — it is this plus the tighter
   * shared-number thresholds in lib/riskTier, which cut the cap automatically
   * once opt-outs start arriving, long before 500/day could do lasting damage.
   */
  maxDailyMessages: 500,
};

/**
 * Has this account completed its own carrier registration?
 *
 * Reuses checkNumberEligibility's local-number rules verbatim rather than
 * restating them, so the cap lifts on exactly the condition that unlocks a local
 * number — there is no second definition of "registered" to drift.
 *
 * @param supabase a **service-role** client, as above.
 */
export async function isProvisionalAccount(supabase: any, userId: string): Promise<boolean> {
  const gate = await checkNumberEligibility(supabase, userId, { numberType: 'local' });
  return !gate.allowed;
}

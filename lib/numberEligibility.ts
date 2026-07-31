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
  userId: string
): Promise<NumberGate> {
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

  // Sole proprietors register with an SSN rather than an EIN, and Telnyx does
  // not require a tax ID from them — so the EIN check must not apply. Mirrors
  // the same exemption in the register route.
  const needsTaxId = reg.entity_type !== 'SOLE_PROPRIETOR';
  if (needsTaxId && !reg.tax_id?.trim()) {
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

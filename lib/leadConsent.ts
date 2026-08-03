// What established a lead's consent, recorded at the point of intake (#130).
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// `leads.sms_opt_in` had `DEFAULT true`, so every lead created by any route was
// marked consented with nothing behind it. Measured before the fix: 209 leads,
// 0 consent records, and the flag had never been `false` for any of them. A
// column that is always true carries no information — and `smsGuard` checking
// it therefore enforced nothing, while the public compliance page said it did
// (#131).
//
// ── The two fields do different jobs ────────────────────────────────────────
//
//   sms_opt_in       the answer: true, false (opted out), or NULL (unknown)
//   consent_source   the evidence for that answer
//
// Keeping them separate is what makes an audit possible. "This lead is
// contactable" and "here is why we believe that" are different questions, and a
// carrier or regulator asks the second one.
//
// ── On agent attestation ────────────────────────────────────────────────────
//
// For imported and hand-entered leads the platform cannot see the consent — it
// happened on the business's own form, or on paper, before the data ever
// reached us. Asking the business to assert it, and recording who asserted it
// and when, is the honest arrangement and the normal one for this kind of
// platform. What is NOT honest is inferring it from silence, which is what a
// column default was doing.
//
// The assertion is not proof and must never be described as proof. It is a
// record that a named account holder took responsibility on a given date.

export type ConsentSource =
  /** Consumer completed the branded opt-in page. Real evidence in contact_form_submissions. */
  | 'opt_in_form'
  /** The business asserted it holds prior express written consent. */
  | 'agent_attested'
  /** The person messaged the business first. */
  | 'inbound_message'
  /** Predates #130. No evidence either way. Never written by new code. */
  | 'legacy_unknown';

export interface ConsentFields {
  sms_opt_in: boolean | null;
  consent_source: ConsentSource | null;
  consent_recorded_at: string | null;
}

/**
 * The columns to write on a lead, given what established its consent.
 *
 * @param source what established it, or null when nothing did
 */
export function consentFields(source: ConsentSource | null): ConsentFields {
  if (!source) {
    // Unknown — deliberately NULL rather than false. False means "this person
    // opted out", which is a different and stronger statement, and `smsGuard`
    // blocks on it.
    return { sms_opt_in: null, consent_source: null, consent_recorded_at: null };
  }
  return {
    sms_opt_in: true,
    consent_source: source,
    consent_recorded_at: new Date().toISOString(),
  };
}

/**
 * The exact wording a business agrees to when importing or hand-entering leads.
 *
 * Kept here as one string for the same reason `buildConsentText` is: it appears
 * in the UI the account holder sees and in what gets recorded, and those two
 * drifting apart would make the record worthless as evidence of what was agreed.
 */
export const ATTESTATION_TEXT =
  'I confirm that every contact in this import has given prior express written consent to ' +
  'receive SMS messages from my business, that I can produce evidence of that consent on ' +
  'request, and that I am responsible for the lawful basis on which these contacts are messaged.';

/**
 * Did the caller attest?
 *
 * Strict identity check against `true`. A missing field, a string "false", or a
 * truthy-but-not-true value all mean "no" — the failure mode to avoid is an
 * import quietly counting as an attestation because a checkbox serialised oddly.
 */
export function isAttested(value: unknown): boolean {
  return value === true;
}

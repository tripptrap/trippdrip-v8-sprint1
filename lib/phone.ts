/**
 * Phone normalisation to E.164 (#100).
 *
 * **This must agree with the `normalize_phone()` SQL function.** That function is
 * what `check_dnc()` and `find_lead_by_phone()` compare against, so a number
 * normalised differently here is a number that silently escapes opt-out
 * enforcement or fails to match its own lead. The rules below are transcribed
 * from it deliberately rather than reinvented:
 *
 *   strip non-digits
 *   11 digits starting with 1  ->  +<digits>
 *   exactly 10 digits          ->  +1<digits>   (assume US)
 *   10 or more digits          ->  +<digits>    (already has a country code)
 *   anything shorter           ->  cannot normalise
 *
 * The one deliberate divergence is that last case: the SQL returns the *input
 * unchanged*, which hands back something non-E.164 that looks normalised. This
 * returns `null` so a caller has to decide. Every current caller validates
 * length before storing, so the case does not arise in practice — it is a
 * footgun being closed, not a behaviour change.
 *
 * Written because `/api/opt-in/submit` had its own inline version that did
 * `'+' + digits` unconditionally, turning a 10-digit US number typed into the
 * branded opt-in form — which is exactly what its placeholder asks for — into
 * `+5550001234`, with no country code. `lib/telnyx.ts` passes `to` straight to
 * the API, so sends to that lead fail: consent collected through the compliant
 * path, and then no way to message the person.
 */
export function normalizePhone(input?: string | null): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 10) return `+${digits}`;

  return null;
}

/** True when `input` can be turned into a valid E.164 number. */
export function isNormalizablePhone(input?: string | null): boolean {
  return normalizePhone(input) !== null;
}

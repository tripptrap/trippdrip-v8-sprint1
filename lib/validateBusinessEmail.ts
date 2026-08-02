/**
 * Email validation matched to what Telnyx actually accepts on brand creation (#1).
 *
 * A user whose contact email Telnyx rejects gets `10019 Invalid email address`
 * from the brand call — which happens *after* the registration row is written,
 * and which they cannot act on because nothing tells them the email was the
 * problem. Catching it at the field is the whole point.
 *
 * ── The rule, measured against the live API rather than assumed ─────────────
 *
 *   ops@mockrun.test              REJECTED   reserved TLD
 *   ops@localhost                 REJECTED   no TLD
 *   notanemail                    REJECTED   malformed
 *   ops@example.com               ACCEPTED
 *   ops@nosuchdomain-zzz99.com    ACCEPTED   no domain lookup is performed
 *
 * So Telnyx checks *shape*, not reachability: it wants a well-formed address
 * whose domain carries a plausible TLD. It does not resolve MX records, and it
 * does not object to `example.com`.
 *
 * **This deliberately does not go beyond that.** Being stricter than Telnyx
 * would block addresses that would have registered fine — a worse failure than
 * the one being fixed, because the user has no way around it. `example.com` is
 * accepted here for exactly that reason, unlikely as it is in real use.
 */

/**
 * TLDs reserved by RFC 2606 / RFC 6761 as permanently non-routable, plus
 * `.local` (mDNS). Nothing behind these can ever receive mail, which is why
 * Telnyx rejects them and why they are safe to reject early.
 */
const UNROUTABLE_TLDS = new Set(['test', 'invalid', 'localhost', 'local', 'example']);

/** Shape only — intentionally the same permissiveness as the opt-in route's check. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export type EmailCheck = { ok: true } | { ok: false; reason: string };

export function validateBusinessEmail(raw: string | null | undefined): EmailCheck {
  const email = (raw ?? '').trim();

  if (!email) {
    return { ok: false, reason: 'Enter a contact email.' };
  }

  if (!EMAIL_SHAPE.test(email)) {
    return {
      ok: false,
      reason: 'Enter a complete email address, including the part after the @ (for example you@yourbusiness.com).',
    };
  }

  const tld = email.split('@').pop()!.split('.').pop()!.toLowerCase();
  if (UNROUTABLE_TLDS.has(tld)) {
    return {
      ok: false,
      reason: `".${tld}" addresses can't receive mail, so carriers won't accept one for business registration. Use an address you can actually be reached at.`,
    };
  }

  return { ok: true };
}

/**
 * Turn Telnyx's brand-creation error into something the user can act on.
 *
 * Their message for a bad email is "The 'email' parameter is not a valid email
 * address" — accurate, but it does not say which of the several fields on the
 * form it means, and it arrives as a toast after the step is done. Anything not
 * recognised is passed through unchanged rather than guessed at.
 */
export function explainBrandError(error: string | undefined | null): string {
  const e = (error ?? '').toLowerCase();
  if (e.includes('email')) {
    return 'Carrier registration rejected the contact email. Use a working business email address and try again.';
  }
  // Matched on the *detail* ("You do not have enough funds to perform this
  // action."), not the title ("Insufficient Funds") — `brandResult.error`
  // carries the detail. Matching the title looked right and never fired.
  if (e.includes('enough funds') || e.includes('insufficient funds')) {
    // Not the user's problem and not something they can fix — say so plainly
    // rather than leaving them retrying. See docs/SYSTEM_STATE.md.
    return 'Business registration is temporarily unavailable. Nothing is wrong with your details — support has been notified.';
  }
  return error || 'Business registration failed.';
}

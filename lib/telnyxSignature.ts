// One Telnyx webhook signature verifier.
//
// ── Why this is shared, and why it exists at all ─────────────────────────────
//
// Telnyx publishes its webhook public key as **raw** base64 Ed25519 — 32 bytes.
// Node's `crypto.createPublicKey({ format: 'der', type: 'spki' })` wants the
// 44-byte SPKI form: the same 32 bytes behind a 12-byte ASN.1 header. Hand it
// the raw key and it throws `Failed to read asymmetric key`, and because that
// throw is caught and turned into "signature invalid", the endpoint answers 401
// to every genuine Telnyx request.
//
// That is #108. Inbound SMS was dead for six months because of it — no message
// stored, no lead created, no opt-out honoured — and it failed silently, since
// nothing downstream ran to notice.
//
// It was fixed in the SMS webhook and **not** in the number-order webhook, which
// had its own copy and kept the bug. Verified against the live production key on
// 2026-08-04: the copied version throws, the fixed version parses. So the
// number-order fulfilment webhook has been rejecting every Telnyx callback since
// it was written.
//
// Hence one implementation. A third endpoint that needs this must import it
// rather than copy it — that is the entire lesson of #108 repeating itself.

import crypto from 'crypto';

/** Node needs SPKI-wrapped Ed25519; Telnyx publishes raw. Bridge the two. */
const SPKI_ED25519_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Verify a Telnyx webhook signature.
 *
 * @param rawBody   the request body EXACTLY as received — re-serialising JSON
 *                  changes the bytes and the signature will not match
 * @param signature `telnyx-signature-ed25519` header
 * @param timestamp `telnyx-timestamp` header
 * @param publicKey base64 Ed25519 public key, raw (32 bytes) or SPKI (44)
 *
 * @returns false for any failure — bad signature, unparseable key, missing
 *          input. Callers must treat false as "reject", never as "skip".
 */
export function verifyTelnyxWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string | undefined
): boolean {
  if (!signature || !timestamp || !publicKey) return false;

  try {
    const rawKey = Buffer.from(publicKey.trim(), 'base64');
    const spkiKey =
      rawKey.length === 32 ? Buffer.concat([SPKI_ED25519_HEADER, rawKey]) : rawKey;

    const keyObject = crypto.createPublicKey({
      key: spkiKey,
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(
      null, // Ed25519 has no separate digest
      Buffer.from(`${timestamp}|${rawBody}`),
      keyObject,
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    console.error('Telnyx signature verification failed:', error);
    return false;
  }
}

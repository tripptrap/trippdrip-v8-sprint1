import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, and catching that
 * would itself leak the secret's length. So both are padded to the same size and
 * the length check is a separate boolean — the byte comparison always runs over
 * the same number of bytes regardless of what was supplied.
 */
export function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const maxLen = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    const lengthsMatch = bufA.length === bufB.length;
    const bytesMatch = timingSafeEqual(paddedA, paddedB);
    return lengthsMatch && bytesMatch;
  } catch {
    return false;
  }
}

/**
 * Gate a cron route. Returns `null` when the caller is authorised, or the
 * response to return as-is when it is not:
 *
 *     const denied = requireCronAuth(req);
 *     if (denied) return denied;
 *
 * ── Why this is shared (#96) ────────────────────────────────────────────────
 *
 * There were five hand-rolled copies of this check, and they had drifted.
 * `process-scheduled` accepted both `x-cron-secret` (external cron services)
 * and `Authorization: Bearer` (Vercel Cron); the other four accepted only the
 * Bearer form. Vercel Cron sends Bearer, so production worked — but pointing an
 * external scheduler at these would have produced a partial failure that reads
 * as healthy: scheduled messages keep flowing while drips, AI drips, reminders
 * and auto-refill all silently 401.
 *
 * That is the second time the cron routes have failed by disagreeing about how
 * they are invoked — see #97, where three of them had their work on POST while
 * Vercel only ever sends GET. One implementation, one place to check.
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  // Trimmed for the same reason the SendGrid key is (#101): 11 production env
  // values carry a trailing newline, and if CRON_SECRET ever picks one up an
  // untrimmed comparison 401s all five crons at once. CRON_SECRET happens to be
  // clean today; that is not a thing to depend on.
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected) {
    console.error('❌ CRON_SECRET not configured — rejecting request');
    return NextResponse.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
  }

  // Accept both forms: Vercel Cron sends `Authorization: Bearer <secret>`,
  // external cron services generally send a custom header.
  const authHeader = req.headers.get('authorization') || '';
  const provided = req.headers.get('x-cron-secret') || authHeader.replace('Bearer ', '');

  if (!secureCompare(provided, expected)) {
    console.error('❌ Invalid or missing cron secret — unauthorized request');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * The same secret also authenticates internal service-to-service calls, sent as
 * `x-internal-secret` (cron → `telnyx/send-sms`, webhook → `receptionist/respond`).
 * Those two routes compared it with `===` while the cron routes went to lengths
 * to be constant-time about the identical value — so a timing oracle on either
 * would have leaked the secret guarding all of them. Same secret, same
 * protection.
 */
export function isInternalCaller(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = req.headers.get('x-internal-secret')?.trim();
  if (!expected || !provided) return false;
  return secureCompare(provided, expected);
}

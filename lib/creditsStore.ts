// One credits request, shared by everything that needs the balance.
//
// ── Why ─────────────────────────────────────────────────────────────────────
//
// Seven components fetch `/api/user/credits` independently — TextsLayout, the
// Composer, LowCreditsWarning (twice), ZeroCreditsModal, SendSMSModal and
// BulkComposeDrawer. Several mount together, so opening /texts fired the same
// request **seven times**, measured against production.
//
// Every one is a serverless invocation and a database round trip for a number
// that is identical in all seven answers.
//
// ── How ─────────────────────────────────────────────────────────────────────
//
// Two mechanisms, both small:
//
//   in-flight dedupe   concurrent callers share one promise, so seven
//                      components mounting in the same tick produce one request
//   short TTL          a caller within a few seconds gets the cached value
//
// Deliberately not a React context or a state library. Those would mean
// rewriting seven components and a provider; this is a drop-in replacement for
// the fetch each already does.
//
// The balance changes when a message is sent or credits are bought, so
// `invalidateCredits()` exists for those paths to force the next read to be
// fresh rather than waiting out the TTL.

export interface CreditsSnapshot {
  credits: number;
  tier?: string | null;
  [key: string]: unknown;
}

const TTL_MS = 5_000;

let cached: { at: number; data: CreditsSnapshot } | null = null;
let inFlight: Promise<CreditsSnapshot | null> | null = null;

/**
 * The account's current credits.
 *
 * @param force skip the cache — for a caller that has just spent or bought
 * @returns null when the request fails. Callers already treat that as "unknown"
 *          and leave whatever they were showing, which is right: a transient
 *          failure should not flash a zero balance at someone.
 */
export async function getCredits(force = false): Promise<CreditsSnapshot | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.data;

  // A second caller arriving mid-flight waits on the same request rather than
  // starting another. This is what collapses seven mounts into one call.
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/user/credits');
      if (!res.ok) return null;
      const data = (await res.json()) as CreditsSnapshot;
      cached = { at: Date.now(), data };
      return data;
    } catch (e) {
      console.error('Credits fetch failed:', e);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Force the next read to be fresh — call after spending or buying credits. */
export function invalidateCredits(): void {
  cached = null;
}

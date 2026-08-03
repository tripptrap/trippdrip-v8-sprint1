// One reading of "why didn't that send", for every UI that sends (#128).
//
// ── What this replaces ──────────────────────────────────────────────────────
//
// The send endpoints return a structured block: `reason`, `retryable`,
// `spamScore`, `detectedWords`, `suggestions`, `on_dnc_list`, plus an HTTP
// status that already separates "out of credits" (402) from "slow down" (429)
// from "not allowed" (403).
//
// Across every .tsx in the product, exactly **one** of those fields was ever
// read — `on_dnc_list`, in two places. Everything else was collapsed into
// `data.error` and thrown at a 4-second toast, or in the bulk and campaign
// paths discarded entirely in favour of a count.
//
// So the server did the work of classifying the failure and the client threw
// the classification away. This turns it back into something renderable.
//
// ── Why a shared parser rather than six local ones ──────────────────────────
//
// Six surfaces send: the inbox composer, the single-send modal, the bulk
// drawer, the campaign runner, bulk scheduling and the follow-up calendar link.
// They hit four different endpoints whose payloads overlap but are not
// identical. Six local interpretations would drift the same way every other
// duplicated rule in this codebase has (#121, #122, #123, #128).

export type SendBlockKind =
  | 'dnc'
  | 'opted_out'
  | 'quiet_hours'
  | 'rate_limited'
  | 'spam'
  | 'no_credits'
  | 'no_number'
  | 'not_allowed'
  | 'temporary'
  | 'unknown';

export interface SendBlock {
  kind: SendBlockKind;
  /** Short label for a heading or badge. */
  title: string;
  /** The server's own sentence — already written for a person to read. */
  detail: string;
  /**
   * True when waiting and trying again can succeed. Drives whether the UI
   * offers "try again" or tells the user the message will never go.
   */
  retryable: boolean;
  /** 0–100, only for a spam block. */
  spamScore?: number;
  /** Words the detector matched, only for a spam block. */
  flaggedWords?: string[];
  /** Concrete rewrites to offer, only for a spam block. */
  suggestions?: string[];
}

const TITLES: Record<SendBlockKind, string> = {
  dnc: 'On your Do Not Contact list',
  opted_out: 'This contact opted out',
  quiet_hours: 'Outside sending hours',
  rate_limited: 'Sending limit reached',
  spam: 'Flagged as spam risk',
  no_credits: 'Out of credits',
  no_number: 'No sending number',
  not_allowed: 'Not allowed',
  temporary: 'Temporary problem',
  unknown: 'Could not send',
};

/**
 * Normalise any send endpoint's failure into something renderable.
 *
 * @param status HTTP status. Carries real information the body does not always
 *               repeat — 402 is specifically "out of credits" and 503 is
 *               specifically "try again shortly".
 * @param body   Parsed JSON response. Tolerates null and non-objects, since a
 *               500 can return HTML.
 */
export function parseSendError(status: number, body: any): SendBlock {
  const b = body && typeof body === 'object' ? body : {};
  const detail: string = b.error || b.message || 'The message could not be sent.';

  // Spam is checked first: it is the only block that carries advice the user
  // can act on immediately, and it should not be flattened into "rate limited"
  // by a coincidental status code.
  if (b.spamRisk) {
    return {
      kind: 'spam',
      title: TITLES.spam,
      detail,
      retryable: false, // The same text will score the same. Editing is the fix.
      spamScore: typeof b.spamScore === 'number' ? b.spamScore : undefined,
      flaggedWords: Array.isArray(b.detectedWords) ? b.detectedWords : [],
      suggestions: Array.isArray(b.suggestions) ? b.suggestions : [],
    };
  }

  // The guard's own vocabulary, when present, is the most precise signal.
  const reason: string | undefined = b.reason;
  const retryable: boolean = b.retryable === true || status === 429 || status === 503;

  if (b.on_dnc_list || reason === 'dnc') {
    return { kind: 'dnc', title: TITLES.dnc, detail, retryable: false };
  }
  if (reason === 'opted_out') {
    return { kind: 'opted_out', title: TITLES.opted_out, detail, retryable: false };
  }
  if (reason === 'quiet_hours') {
    return { kind: 'quiet_hours', title: TITLES.quiet_hours, detail, retryable: true };
  }
  if (reason === 'rate_limited' || b.rateLimited || status === 429) {
    return { kind: 'rate_limited', title: TITLES.rate_limited, detail, retryable: true };
  }
  if (reason === 'none_owned') {
    return { kind: 'no_number', title: TITLES.no_number, detail, retryable: false };
  }
  if (reason === 'lookup_failed' || reason === 'check_failed' || status === 503) {
    return { kind: 'temporary', title: TITLES.temporary, detail, retryable: true };
  }
  if (reason === 'account_blocked') {
    return { kind: 'not_allowed', title: TITLES.not_allowed, detail, retryable: false };
  }

  if (status === 402) {
    return { kind: 'no_credits', title: TITLES.no_credits, detail, retryable: false };
  }
  if (status === 403) {
    return { kind: 'not_allowed', title: TITLES.not_allowed, detail, retryable: false };
  }

  return { kind: 'unknown', title: TITLES.unknown, detail, retryable };
}

/**
 * One line suitable for a toast, where there is no room for the full shape.
 *
 * Keeps the server's sentence and prefixes the classification, so a toast still
 * says *which kind* of problem it is — the thing every caller was dropping.
 */
export function sendErrorLine(block: SendBlock): string {
  return block.kind === 'unknown' ? block.detail : `${block.title} — ${block.detail}`;
}

/**
 * An Error that still carries the classification.
 *
 * The send flow in TextsLayout is throw-based, and `throw new Error(data.error)`
 * is precisely where the structure was being destroyed — the payload was parsed,
 * one field read, and the rest dropped on the floor one line later. Subclassing
 * keeps every existing `catch (err) { toast.error(err.message) }` working while
 * letting a caller that wants the detail reach for `err.block`.
 */
export class SendBlockedError extends Error {
  readonly block: SendBlock;
  constructor(block: SendBlock) {
    super(sendErrorLine(block));
    this.name = 'SendBlockedError';
    this.block = block;
  }
}

/** Narrowing helper — `instanceof` is unreliable across bundle boundaries. */
export function isSendBlocked(err: unknown): err is SendBlockedError {
  return !!err && typeof err === 'object' && 'block' in (err as any);
}

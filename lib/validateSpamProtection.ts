// Server-side bounds for user_settings.spam_protection (#128).
//
// The ranges on the Settings form are HTML `min`/`max` attributes, which is to
// say they are a suggestion to the browser. `POST /api/settings` wrote the JSON
// straight into the column with no validation at all, so any value — negative,
// fractional, a string, 10^9 — could be stored by posting directly.
//
// That matters because these numbers are the enforcement caps. A garbage value
// does not fail loudly; it changes how much traffic the account is allowed to
// put on a shared carrier registration.
//
// ── Two deliberate choices ──────────────────────────────────────────────────
//
// **Zero is allowed on every cap, even where the form's `min` is 1.** lib/smsGuard
// blocks on `sent >= cap` guarded by `cap >= 0`, and its comment records why:
// zero means *zero allowed*, and it is the obvious way for an operator to stop
// one account sending. An earlier `cap > 0` guard made setting zero silently
// permit everything. Rejecting 0 here would take that lever away again.
//
// **Every key is optional.** The same POST body carries the Stripe and email
// sections, and the two rows in production hold only four of the eleven keys —
// the column default. Requiring keys would make saving any other tab fail.

export interface SpamProtectionValidation {
  ok: boolean;
  /** Human-readable, safe to return to the caller. */
  error?: string;
}

type Bound = { min: number; max: number };

/**
 * Upper bounds match the Settings form; lower bounds are 0 for the reason above.
 * `weekendLimitPercent` is a percentage, so 100 is its natural ceiling.
 */
const NUMERIC_BOUNDS: Record<string, Bound> = {
  maxMessagesPerMinute: { min: 0, max: 60 },
  maxHourlyMessages: { min: 0, max: 1000 },
  maxDailyMessages: { min: 0, max: 10000 },
  maxCampaignMessagesPerHour: { min: 0, max: 500 },
  maxMessagesPerContact: { min: 0, max: 20 },
  cooldownMinutes: { min: 0, max: 1440 },
  maxBulkRecipients: { min: 0, max: 5000 },
  weekendLimitPercent: { min: 0, max: 100 },
};

const BOOLEAN_KEYS = ['enabled', 'blockOnHighRisk', 'enableWeekendLimits'];

export function validateSpamProtection(value: unknown): SpamProtectionValidation {
  // Absent is fine — a POST that only updates the email section sends no
  // spamProtection at all.
  if (value === undefined || value === null) return { ok: true };

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'spamProtection must be an object' };
  }

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (BOOLEAN_KEYS.includes(key)) {
      if (typeof v !== 'boolean') {
        return { ok: false, error: `${key} must be true or false` };
      }
      continue;
    }

    const bound = NUMERIC_BOUNDS[key];
    if (!bound) {
      // Rejected rather than ignored. A misspelled key stored silently does
      // nothing, and the setting it was meant to change quietly keeps its
      // default — a failure with no symptom until someone reads the JSON.
      return { ok: false, error: `Unknown spam protection setting: ${key}` };
    }

    // Number.isInteger is false for NaN, Infinity and non-numbers, so this one
    // test covers every shape that would otherwise become a NaN comparison in
    // the guard — and `NaN >= cap` is false, meaning an unusable cap would fail
    // OPEN and permit everything.
    if (!Number.isInteger(v)) {
      return { ok: false, error: `${key} must be a whole number` };
    }
    const n = v as number;
    if (n < bound.min || n > bound.max) {
      return { ok: false, error: `${key} must be between ${bound.min} and ${bound.max}` };
    }
  }

  return { ok: true };
}

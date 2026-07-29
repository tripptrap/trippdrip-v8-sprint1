// Shared quiet-hours logic for every outbound SMS path.
//
// Why this exists (#50): quiet hours were implemented three different ways and
// missing entirely from the highest-volume path.
//   - process-scheduled read the user's configured columns (correct)
//   - process-drips / process-ai-drips / send-appointment-reminders each had
//     their own copy of a hardcoded 9pm-9am *Eastern* window, ignoring the
//     user's settings and timezone
//   - campaigns/run, schedule/bulk and telnyx/send-sms had no check at all
//
// The hardcoded window also disagreed with the defaults it was standing in for:
// users.quiet_hours_start/end default to 08:00-20:00, not 09:00-21:00.
//
// The bigger problem it fixes: TCPA quiet hours are defined by the **called
// party's** local time, not the sender's. Every previous implementation was
// sender-relative, so a California lead texted at 9am Eastern received at 6am
// Pacific — inside the prohibited window, from a path that believed it was
// compliant.

/** Fallback when a recipient's timezone can't be determined. */
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * US state/territory -> every IANA timezone the state spans, most populous
 * first.
 *
 * This used to map each split state to a single **westernmost** zone, on the
 * reasoning that guessing west "only ever makes us more conservative". That is
 * only true at the morning edge. A window has two edges, and west is permissive
 * at the evening one: at 20:45 Eastern a Florida lead was computed as 19:45
 * Central and sent, while most of Florida is Eastern and actually at 20:45 —
 * past the cutoff. Same for Texas, which is overwhelmingly Central but was
 * mapped to Mountain. Those two states are 86 of the leads on this account.
 *
 * So both zones are kept and the decision is taken across all of them: blocked
 * if it is quiet hours in ANY zone the state spans (see checkQuietHours). That
 * is conservative at both edges, which is what a compliance gate should be —
 * the cost is a bounded delay near the boundary, and the alternative is texting
 * someone at 8:45pm.
 */
const STATE_TIMEZONES: Record<string, string[]> = {
  AL: ['America/Chicago'],
  AK: ['America/Anchorage', 'America/Adak'],
  AZ: ['America/Phoenix'],
  AR: ['America/Chicago'],
  CA: ['America/Los_Angeles'],
  CO: ['America/Denver'],
  CT: ['America/New_York'],
  DE: ['America/New_York'],
  DC: ['America/New_York'],
  FL: ['America/New_York', 'America/Chicago'],
  GA: ['America/New_York'],
  HI: ['Pacific/Honolulu'],
  ID: ['America/Boise', 'America/Los_Angeles'],
  IL: ['America/Chicago'],
  IN: ['America/Indiana/Indianapolis', 'America/Chicago'],
  IA: ['America/Chicago'],
  KS: ['America/Chicago', 'America/Denver'],
  KY: ['America/New_York', 'America/Chicago'],
  LA: ['America/Chicago'],
  ME: ['America/New_York'],
  MD: ['America/New_York'],
  MA: ['America/New_York'],
  MI: ['America/Detroit', 'America/Menominee'],
  MN: ['America/Chicago'],
  MS: ['America/Chicago'],
  MO: ['America/Chicago'],
  MT: ['America/Denver'],
  NE: ['America/Chicago', 'America/Denver'],
  NV: ['America/Los_Angeles'],
  NH: ['America/New_York'],
  NJ: ['America/New_York'],
  NM: ['America/Denver'],
  NY: ['America/New_York'],
  NC: ['America/New_York'],
  ND: ['America/Chicago', 'America/Denver'],
  OH: ['America/New_York'],
  OK: ['America/Chicago'],
  OR: ['America/Los_Angeles', 'America/Boise'],
  PA: ['America/New_York'],
  RI: ['America/New_York'],
  SC: ['America/New_York'],
  SD: ['America/Chicago', 'America/Denver'],
  TN: ['America/Chicago', 'America/New_York'],
  TX: ['America/Chicago', 'America/Denver'],
  UT: ['America/Denver'],
  VT: ['America/New_York'],
  VA: ['America/New_York'],
  WA: ['America/Los_Angeles'],
  WV: ['America/New_York'],
  WI: ['America/Chicago'],
  WY: ['America/Denver'],
  PR: ['America/Puerto_Rico'],
  VI: ['America/Puerto_Rico'],
  GU: ['Pacific/Guam'],
};

export interface QuietHoursSettings {
  quiet_hours_enabled?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
}

export interface QuietHoursResult {
  /** True when sending right now is NOT allowed. */
  inQuietHours: boolean;
  /** Timezone the decision was made in. */
  timezone: string;
  /** Whether that came from the recipient's state or fell back to the sender. */
  basis: 'recipient' | 'sender';
  /** Local time used, "HH:MM" — handy for logs. */
  localTime: string;
  window: { start: string; end: string };
}

/**
 * Resolve a recipient's timezone from their state code. Returns null when the
 * state is missing or unrecognised — `leads.state` is free text and contains
 * junk values, so this must not guess.
 */
export function timezoneForState(state?: string | null): string | null {
  return timezonesForState(state)?.[0] ?? null;
}

/**
 * Every timezone a state spans, most populous first. Null when the state is
 * missing or unrecognised.
 */
export function timezonesForState(state?: string | null): string[] | null {
  if (!state) return null;
  const key = state.trim().toUpperCase();
  return STATE_TIMEZONES[key] ?? null;
}

/** Current wall-clock time in a timezone as "HH:MM". */
function localTimeIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(at)
    // en-US formats midnight as "24:00" in some runtimes; normalise it.
    .replace(/^24:/, '00:');
}

/**
 * Decide whether sending is currently blocked by quiet hours.
 *
 * Prefers the recipient's local time (what TCPA actually keys on) and falls
 * back to the sender's configured timezone when the recipient's state is
 * unknown. Honours the user's configured window rather than a hardcoded one.
 */
export function checkQuietHours(
  settings: QuietHoursSettings | null | undefined,
  recipientState?: string | null,
  now: Date = new Date()
): QuietHoursResult {
  const start = (settings?.quiet_hours_start || '08:00').substring(0, 5);
  const end = (settings?.quiet_hours_end || '20:00').substring(0, 5);

  const recipientZones = timezonesForState(recipientState);
  const zones = recipientZones ?? [settings?.timezone || DEFAULT_TIMEZONE];
  const basis: 'recipient' | 'sender' = recipientZones ? 'recipient' : 'sender';

  // Windows are same-day (e.g. 08:00-20:00): allowed inside, blocked outside.
  // A window that wraps midnight (start > end, e.g. 20:00-08:00) is treated as
  // the allowed period spanning midnight, so the logic holds either way.
  const allowedIn = (tz: string) => {
    const t = localTimeIn(tz, now);
    return start <= end ? t >= start && t < end : t >= start || t < end;
  };

  // Blocked if it's quiet hours in ANY zone the state spans — we don't know
  // which side of a split state the lead is on, and the safe assumption is
  // whichever one says don't send. Report that zone so logs name the reason.
  const blockingZone = zones.find((tz) => !allowedIn(tz));
  const timezone = blockingZone ?? zones[0];
  const localTime = localTimeIn(timezone, now);

  // Explicitly disabled: the user opted out of their own sending window. Still
  // report the computed values so callers can log them.
  if (settings && settings.quiet_hours_enabled === false) {
    return { inQuietHours: false, timezone: zones[0], basis, localTime: localTimeIn(zones[0], now), window: { start, end } };
  }

  return { inQuietHours: !!blockingZone, timezone, basis, localTime, window: { start, end } };
}

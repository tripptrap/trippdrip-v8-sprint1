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
 * US state/territory -> IANA timezone.
 *
 * States that span multiple zones are mapped to their **westernmost** zone on
 * purpose. Guessing too far east makes the computed local time later than
 * reality, which risks sending before the morning cutoff; guessing west only
 * ever makes us more conservative. Split states: AK, FL, ID, IN, KS, KY, MI,
 * ND, NE, OR, SD, TN, TX.
 */
const STATE_TIMEZONES: Record<string, string> = {
  AL: 'America/Chicago',    AK: 'America/Anchorage',  AZ: 'America/Phoenix',
  AR: 'America/Chicago',    CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York',   DE: 'America/New_York',   DC: 'America/New_York',
  FL: 'America/Chicago',    GA: 'America/New_York',   HI: 'Pacific/Honolulu',
  ID: 'America/Los_Angeles', IL: 'America/Chicago',   IN: 'America/Chicago',
  IA: 'America/Chicago',    KS: 'America/Denver',     KY: 'America/Chicago',
  LA: 'America/Chicago',    ME: 'America/New_York',   MD: 'America/New_York',
  MA: 'America/New_York',   MI: 'America/Chicago',    MN: 'America/Chicago',
  MS: 'America/Chicago',    MO: 'America/Chicago',    MT: 'America/Denver',
  NE: 'America/Denver',     NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York',   NM: 'America/Denver',     NY: 'America/New_York',
  NC: 'America/New_York',   ND: 'America/Denver',     OH: 'America/New_York',
  OK: 'America/Chicago',    OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York',   SC: 'America/New_York',   SD: 'America/Denver',
  TN: 'America/Chicago',    TX: 'America/Denver',     UT: 'America/Denver',
  VT: 'America/New_York',   VA: 'America/New_York',   WA: 'America/Los_Angeles',
  WV: 'America/New_York',   WI: 'America/Chicago',    WY: 'America/Denver',
  PR: 'America/Puerto_Rico', VI: 'America/Puerto_Rico', GU: 'Pacific/Guam',
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

  const recipientTz = timezoneForState(recipientState);
  const timezone = recipientTz || settings?.timezone || DEFAULT_TIMEZONE;
  const basis: 'recipient' | 'sender' = recipientTz ? 'recipient' : 'sender';
  const localTime = localTimeIn(timezone, now);

  // Explicitly disabled: the user opted out of their own sending window. Still
  // report the computed values so callers can log them.
  if (settings && settings.quiet_hours_enabled === false) {
    return { inQuietHours: false, timezone, basis, localTime, window: { start, end } };
  }

  // Windows are same-day (e.g. 08:00-20:00): allowed inside, blocked outside.
  // A window that wraps midnight (start > end, e.g. 20:00-08:00) is treated as
  // the allowed period spanning midnight, so the logic holds either way.
  const allowed =
    start <= end
      ? localTime >= start && localTime < end
      : localTime >= start || localTime < end;

  return { inQuietHours: !allowed, timezone, basis, localTime, window: { start, end } };
}

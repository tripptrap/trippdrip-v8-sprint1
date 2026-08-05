// Business Hours Utility for Receptionist Mode

import { ReceptionistSettings, BusinessHoursCheckResult } from './types';

/**
 * Check if current time is within business hours
 */
export function isWithinBusinessHours(
  settings: ReceptionistSettings,
  at: Date = new Date()
): BusinessHoursCheckResult {
  // If business hours are disabled, always return open
  if (!settings.business_hours_enabled) {
    return { isOpen: true, reason: 'Business hours not enforced' };
  }

  const now = at;
  const timezone = settings.business_hours_timezone || 'America/New_York';

  // Get current time in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';

  // Convert weekday to number (1=Mon, 7=Sun)
  const dayMap: Record<string, number> = {
    'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7
  };
  const currentDay = dayMap[weekday] || 1;

  // Check if today is a business day
  const businessDays = settings.business_days || [1, 2, 3, 4, 5];
  if (!businessDays.includes(currentDay)) {
    const nextOpenDay = getNextBusinessDay(currentDay, businessDays);
    return {
      isOpen: false,
      reason: `Closed today (${weekday})`,
      nextOpenTime: `Next open: ${getDayName(nextOpenDay)} at ${formatTime(settings.business_hours_start)}`,
    };
  }

  // Parse business hours
  const [startHour, startMinute] = parseTime(settings.business_hours_start);
  const [endHour, endMinute] = parseTime(settings.business_hours_end);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Check if within hours
  if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
    return { isOpen: true, reason: 'Within business hours' };
  }

  // Determine next open time
  let nextOpenTime: string;
  if (currentMinutes < startMinutes) {
    // Before opening today
    nextOpenTime = `Opens at ${formatTime(settings.business_hours_start)} today`;
  } else {
    // After closing, next business day
    const nextOpenDay = getNextBusinessDay(currentDay, businessDays);
    if (nextOpenDay === currentDay + 1 || (currentDay === 7 && nextOpenDay === 1)) {
      nextOpenTime = `Opens at ${formatTime(settings.business_hours_start)} tomorrow`;
    } else {
      nextOpenTime = `Opens ${getDayName(nextOpenDay)} at ${formatTime(settings.business_hours_start)}`;
    }
  }

  return {
    isOpen: false,
    reason: currentMinutes < startMinutes ? 'Before business hours' : 'After business hours',
    nextOpenTime,
  };
}

/**
 * Parse time string "HH:MM:SS" or "HH:MM" to [hour, minute]
 */
function parseTime(timeStr: string): [number, number] {
  const parts = timeStr.split(':');
  return [parseInt(parts[0]) || 0, parseInt(parts[1]) || 0];
}

/**
 * Format time string to human readable format
 */
function formatTime(timeStr: string): string {
  const [hour, minute] = parseTime(timeStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get day name from number
 */
function getDayName(day: number): string {
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days[day] || '';
}

/**
 * Find the next business day
 */
function getNextBusinessDay(currentDay: number, businessDays: number[]): number {
  // Look for next business day starting from tomorrow
  for (let i = 1; i <= 7; i++) {
    const checkDay = ((currentDay - 1 + i) % 7) + 1;
    if (businessDays.includes(checkDay)) {
      return checkDay;
    }
  }
  // Fallback to current day if no business days configured
  return currentDay;
}

/**
 * Get formatted business hours string for display
 */
export function getBusinessHoursDisplay(settings: ReceptionistSettings): string {
  if (!settings.business_hours_enabled) {
    return 'Available 24/7';
  }

  const days = settings.business_days || [1, 2, 3, 4, 5];
  const dayNames = days.map(d => getDayName(d).substring(0, 3)).join(', ');
  const startTime = formatTime(settings.business_hours_start);
  const endTime = formatTime(settings.business_hours_end);

  return `${dayNames}: ${startTime} - ${endTime} (${settings.business_hours_timezone})`;
}

/**
 * The instant the current closed period began, or null if the business is open.
 *
 * This is what makes "send the after-hours message once, not once per text"
 * possible (#138). Without a boundary to compare against, the only options are a
 * fixed cooldown — which sends a second "we're closed" in the middle of the same
 * night — or nothing, which is what shipped: a contact who sent five messages
 * got five identical replies.
 *
 * Cases, in the business's own timezone:
 *   - open now                    -> null
 *   - business day, past closing  -> today at closing time
 *   - business day, before opening-> the previous business day's closing time
 *   - not a business day          -> the most recent business day's closing time
 *
 * The last two are why this walks backwards instead of subtracting a day: a
 * Sunday-evening text has to reach back past Saturday to Friday's close, and a
 * fixed offset would land inside the closed period and re-arm the message.
 */
export function closedPeriodStart(
  settings: ReceptionistSettings,
  at: Date = new Date()
): Date | null {
  if (!settings.business_hours_enabled) return null;
  if (isWithinBusinessHours(settings, at).isOpen) return null;

  const timezone = settings.business_hours_timezone || 'America/New_York';
  const businessDays = settings.business_days || [1, 2, 3, 4, 5];
  if (businessDays.length === 0) return null;

  const [endHour, endMinute] = parseTime(settings.business_hours_end);
  const here = zonedParts(at, timezone);
  const nowMinutes = here.hour * 60 + here.minute;
  const endMinutes = endHour * 60 + endMinute;

  // Closed because today's shift already finished.
  if (businessDays.includes(here.weekday) && nowMinutes >= endMinutes) {
    return zonedTimeToUtc(here.year, here.month, here.day, endHour, endMinute, timezone);
  }

  // Otherwise the period began when the previous open day ended. Eight days
  // covers any weekly pattern, including a single business day per week.
  for (let back = 1; back <= 8; back++) {
    const d = addCalendarDays(here.year, here.month, here.day, -back);
    if (businessDays.includes(d.weekday)) {
      return zonedTimeToUtc(d.year, d.month, d.day, endHour, endMinute, timezone);
    }
  }

  return null;
}

/** Wall-clock fields of `date` as seen in `timeZone`, with ISO weekday (1=Mon). */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const year = get('year'), month = get('month'), day = get('day');
  // `hour` can format as 24 for midnight under hour12:false in some runtimes.
  const hour = get('hour') % 24;

  return {
    year, month, day, hour,
    minute: get('minute'),
    second: get('second'),
    weekday: isoWeekday(year, month, day),
  };
}

/**
 * The UTC instant at which `timeZone`'s wall clock reads the given date/time.
 *
 * Two passes, because the offset depends on the instant we are solving for: the
 * first guess uses the offset at the wrong moment, which is off by an hour
 * across a DST boundary. Re-measuring at the corrected instant settles it.
 */
function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timeZone: string
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(wallClock - zoneOffsetMs(new Date(wallClock), timeZone));
  instant = new Date(wallClock - zoneOffsetMs(instant, timeZone));
  return instant;
}

/** How far ahead of UTC `timeZone` is at `date`, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

/** Plain calendar arithmetic — no timezone involved, so UTC is safe here. */
function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: isoWeekday(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
  };
}

/** ISO weekday: 1 = Monday … 7 = Sunday, matching `business_days`. */
function isoWeekday(year: number, month: number, day: number): number {
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return sundayFirst === 0 ? 7 : sundayFirst;
}

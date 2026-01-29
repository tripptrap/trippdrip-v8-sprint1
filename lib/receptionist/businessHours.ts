// Business Hours Utility for Receptionist Mode

import { ReceptionistSettings, BusinessHoursCheckResult } from './types';

/**
 * Check if current time is within business hours
 */
export function isWithinBusinessHours(settings: ReceptionistSettings): BusinessHoursCheckResult {
  // If business hours are disabled, always return open
  if (!settings.business_hours_enabled) {
    return { isOpen: true, reason: 'Business hours not enforced' };
  }

  const now = new Date();
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

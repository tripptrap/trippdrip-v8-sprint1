import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from 'googleapis';

export const dynamic = "force-dynamic";

async function getAuthClient(userId: string) {
  const supabase = await createClient();

  const { data: userData, error } = await supabase
    .from('users')
    .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !userData?.google_calendar_refresh_token) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/oauth/callback`
  );

  oauth2Client.setCredentials({
    access_token: userData.google_calendar_access_token,
    refresh_token: userData.google_calendar_refresh_token,
    expiry_date: userData.google_calendar_token_expiry ? new Date(userData.google_calendar_token_expiry).getTime() : undefined
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      await supabase
        .from('users')
        .update({
          google_calendar_access_token: tokens.access_token,
          google_calendar_refresh_token: tokens.refresh_token,
          google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
        })
        .eq('id', userId);
    } else if (tokens.access_token) {
      await supabase
        .from('users')
        .update({
          google_calendar_access_token: tokens.access_token,
          google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
        })
        .eq('id', userId);
    }
  });

  return oauth2Client;
}

// Get available time slots
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated', hasCalendar: false }, { status: 401 });
    }

    const { action, dateRequested } = await req.json();

    // Get authenticated client
    const auth = await getAuthClient(user.id);

    if (!auth) {
      return NextResponse.json({
        hasCalendar: false,
        message: "Calendar not connected"
      });
    }

    if (action === 'check-availability') {
      // Parse the requested date (e.g., "next month", "tomorrow", etc.)
      const targetDate = parseDateRequest(dateRequested || 'next week');

      const calendar = google.calendar({ version: 'v3', auth });

      // Check free/busy for the next 5 business days starting from target date
      const timeMin = targetDate.toISOString();
      const timeMax = new Date(targetDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: [{ id: 'primary' }]
        }
      });

      const busySlots = (response.data.calendars?.primary?.busy || [])
        .filter((slot): slot is { start: string; end: string } =>
          slot.start != null && slot.end != null
        );

      // Get available slots (business hours: 9 AM - 5 PM, Monday-Friday)
      const availableSlots = getBusinessHourSlots(timeMin, timeMax, busySlots);

      return NextResponse.json({
        hasCalendar: true,
        availableSlots: availableSlots.slice(0, 5), // Return first 5 slots
        dateRange: { start: timeMin, end: timeMax }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Calendar API error:', error);
    return NextResponse.json({
      hasCalendar: false,
      error: error.message || 'Failed to check calendar'
    }, { status: 500 });
  }
}

// Parse natural language date requests
function parseDateRequest(request: string): Date {
  const now = new Date();
  const lower = request.toLowerCase();

  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    return nextWeek;
  }

  if (lower.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    return nextMonth;
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow;
  }

  // Default to next week
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  return nextWeek;
}

// Get business hour slots (9 AM - 5 PM, Monday-Friday)
function getBusinessHourSlots(
  timeMin: string,
  timeMax: string,
  busySlots: Array<{ start: string; end: string }>
): Array<{ start: string; end: string; formatted: string }> {
  const slots: Array<{ start: string; end: string; formatted: string }> = [];
  const slotDuration = 60 * 60 * 1000; // 1 hour in milliseconds

  let currentDate = new Date(timeMin);
  const endDate = new Date(timeMax);

  while (currentDate < endDate) {
    const dayOfWeek = currentDate.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
      continue;
    }

    // Set to 9 AM if before business hours
    if (currentDate.getHours() < 9) {
      currentDate.setHours(9, 0, 0, 0);
    }

    // Move to next day if past business hours
    if (currentDate.getHours() >= 17) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(9, 0, 0, 0);
      continue;
    }

    const slotEnd = new Date(currentDate.getTime() + slotDuration);

    // Check if within business hours and not busy
    if (slotEnd.getHours() <= 17) {
      const isSlotFree = !busySlots.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return (currentDate < busyEnd && slotEnd > busyStart);
      });

      if (isSlotFree) {
        slots.push({
          start: currentDate.toISOString(),
          end: slotEnd.toISOString(),
          formatted: formatTimeSlot(currentDate)
        });
      }
    }

    // Move to next hour
    currentDate.setHours(currentDate.getHours() + 1);
  }

  return slots;
}

// Format time slot for display
function formatTimeSlot(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  const hours = date.getHours();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);

  return `${dayName}, ${monthName} ${dayNum} at ${displayHours}:00 ${period}`;
}

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getAuthClient(userId: string) {
  const supabase = await createClient();

  const { data: userData, error } = await supabase
    .from('users')
    .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !userData?.google_calendar_refresh_token) {
    throw new Error('Google Calendar not connected');
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { timeMin, timeMax } = body;

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: 'Missing required fields: timeMin and timeMax' }, { status: 400 });
    }

    // Get authenticated client
    const auth = await getAuthClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth });

    // Check free/busy
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

    // Calculate free time slots (30 minute intervals)
    const freeSlots = calculateFreeSlots(timeMin, timeMax, busySlots);

    return NextResponse.json({
      success: true,
      busySlots,
      freeSlots
    });
  } catch (error: any) {
    console.error('Calendar availability check error:', error);

    if (error.message === 'Google Calendar not connected') {
      return NextResponse.json({ error: 'Please connect your Google Calendar first' }, { status: 400 });
    }

    return NextResponse.json({ error: error.message || 'Failed to check availability' }, { status: 500 });
  }
}

// Helper function to calculate free time slots
function calculateFreeSlots(
  timeMin: string,
  timeMax: string,
  busySlots: Array<{ start: string; end: string }>
): Array<{ start: string; end: string }> {
  const freeSlots: Array<{ start: string; end: string }> = [];
  const slotDuration = 30 * 60 * 1000; // 30 minutes in milliseconds

  const startTime = new Date(timeMin);
  const endTime = new Date(timeMax);

  let currentTime = new Date(startTime);

  while (currentTime < endTime) {
    const slotEnd = new Date(currentTime.getTime() + slotDuration);

    // Check if this slot overlaps with any busy slots
    const isSlotFree = !busySlots.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);

      // Check for overlap
      return (currentTime < busyEnd && slotEnd > busyStart);
    });

    if (isSlotFree && slotEnd <= endTime) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: slotEnd.toISOString()
      });
    }

    currentTime = slotEnd;
  }

  return freeSlots;
}

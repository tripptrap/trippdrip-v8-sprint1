import { NextRequest, NextResponse } from "next/server";
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { DateTime } from "luxon";

const SLOT_DURATION_MIN = 30; // 30-minute slots

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const auth = await getAuthClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth });
    const tz = process.env.TIMEZONE || "America/New_York";

    // start with "today"
    let day = DateTime.now().setZone(tz).startOf("day");
    let slots: any[] = [];

    // we'll look up to 14 days ahead
    for (let i = 0; i < 14 && slots.length < 3; i++) {
      const dayStart = day.plus({ days: i }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
      const dayEnd = day.plus({ days: i }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

      // get events for that day
      const eventsRes = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart.toISO() as string,
        timeMax: dayEnd.toISO() as string,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = eventsRes.data.items || [];

      // build busy blocks
      const busy: Array<{ start: DateTime; end: DateTime }> = events
        .filter(e => e.start?.dateTime && e.end?.dateTime)
        .map(e => ({
          start: DateTime.fromISO(e.start!.dateTime!).setZone(tz),
          end: DateTime.fromISO(e.end!.dateTime!).setZone(tz),
        }));

      // walk through the day in 30-min chunks
      let slotTime = dayStart;
      while (slotTime < dayEnd && slots.length < 3) {
        const slotEnd = slotTime.plus({ minutes: SLOT_DURATION_MIN });

        const overlaps = busy.some(b => {
          return slotTime < b.end && slotEnd > b.start;
        });

        if (!overlaps && slotTime > DateTime.now().setZone(tz)) {
          slots.push({
            start: slotTime.toISO(),
            end: slotEnd.toISO(),
            display: slotTime.toFormat("h:mm a"),
            day: slotTime.toFormat("ccc, MMM d"),
            formatted: `${slotTime.toFormat("ccc, MMM d")} at ${slotTime.toFormat("h:mm a")}`,
          });
        }

        slotTime = slotTime.plus({ minutes: SLOT_DURATION_MIN });
      }
    }

    console.log(`📅 Found ${slots.length} available slots`);
    return NextResponse.json({ slots });
  } catch (err: any) {
    console.error("get-slots error", err);
    return NextResponse.json({ error: "Failed to get slots" }, { status: 500 });
  }
}

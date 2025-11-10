import { NextRequest, NextResponse } from "next/server";
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { start, end, name, phone, email } = await req.json();

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const auth = await getAuthClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth });

    // re-check to avoid double booking
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: "startTime",
    });

    if ((data.items || []).length > 0) {
      return NextResponse.json({ error: "Time slot already booked" }, { status: 409 });
    }

    const event = {
      summary: `Call with ${name || "Prospect"}`,
      description: phone ? `Phone: ${phone}` : "",
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: email ? [{ email }] : [],
    };

    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log(`✅ Booked appointment: ${created.data.id}`);
    return NextResponse.json({ ok: true, eventId: created.data.id });
  } catch (err: any) {
    console.error("book-slot error", err);
    return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
  }
}

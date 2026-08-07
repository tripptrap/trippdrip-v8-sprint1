import { NextRequest, NextResponse } from "next/server";
import { google } from 'googleapis';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

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

  // Token rotation. SERVICE ROLE — none of the three google_calendar_* columns is
  // writable by `authenticated` (verified live; public.users accepts only
  // business_hours, business_name, timezone, updated_at from that role). These two
  // writes also discarded their result entirely, so every rotation was refused
  // with 42501 and silently dropped, leaving the stored access token to go stale
  // until the refresh token was the only thing still working (#187).
  //
  // This handler is fire-and-forget inside the googleapis client — nothing awaits
  // it and there is no caller to return an error to — so the most it can do is say
  // so loudly. That is still infinitely better than dropping it on the floor.
  oauth2Client.on('tokens', async (tokens) => {
    const rotated: Record<string, string | null> = {};
    if (tokens.access_token) {
      rotated.google_calendar_access_token = tokens.access_token;
      rotated.google_calendar_token_expiry = tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null;
    }
    // Google only re-issues a refresh token occasionally; never overwrite a good
    // one with undefined, which would disconnect the account outright.
    if (tokens.refresh_token) {
      rotated.google_calendar_refresh_token = tokens.refresh_token;
    }
    if (Object.keys(rotated).length === 0) return;

    const { error: rotateError } = await createServiceRoleClient()
      .from('users')
      .update(rotated)
      .eq('id', userId);

    if (rotateError) {
      console.error(`Google Calendar token rotation failed for user ${userId} — the stored token will go stale:`, rotateError);
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

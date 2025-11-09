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
    const { summary, description, start, end, attendeeEmail, attendeeName, leadId } = body;

    if (!summary || !start || !end) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get authenticated client
    const auth = await getAuthClient(user.id);
    const calendar = google.calendar({ version: 'v3', auth });

    // Create event
    const event = {
      summary,
      description: description || '',
      start: {
        dateTime: start,
        timeZone: 'America/New_York', // TODO: Make this configurable per user
      },
      end: {
        dateTime: end,
        timeZone: 'America/New_York',
      },
      attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: attendeeEmail ? 'all' : 'none', // Send email invite if attendee provided
    });

    // Save event to database
    await supabase.from('calendar_events').insert({
      user_id: user.id,
      google_event_id: response.data.id,
      lead_id: leadId,
      summary,
      description,
      start_time: start,
      end_time: end,
      attendee_email: attendeeEmail,
      attendee_name: attendeeName,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink
    });
  } catch (error: any) {
    console.error('Calendar event creation error:', error);

    if (error.message === 'Google Calendar not connected') {
      return NextResponse.json({ error: 'Please connect your Google Calendar first' }, { status: 400 });
    }

    return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
  }
}

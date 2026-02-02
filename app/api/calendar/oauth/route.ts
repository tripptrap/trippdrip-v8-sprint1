import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if coming from onboarding flow
    const from = request.nextUrl.searchParams.get('from');
    const statePayload = JSON.stringify({ userId: user.id, from: from || '' });
    const stateEncoded = Buffer.from(statePayload).toString('base64');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/oauth/callback`
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ],
      state: stateEncoded, // Pass user ID + origin to callback
      prompt: 'consent' // Force consent to get refresh token
    });

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('OAuth initiation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // user ID (for validation only)
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=${error}`);
    }

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=missing_params`);
    }

    // Get authenticated user from session - DO NOT trust state parameter
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=not_authenticated`);
    }

    // Decode state payload (supports both new JSON format and legacy plain user ID)
    let stateUserId = state;
    let stateFrom = '';
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        stateUserId = decoded.userId;
        stateFrom = decoded.from || '';
      } catch {
        // Legacy format: state is just the user ID
        stateUserId = state;
      }
    }

    // Validate state matches authenticated user (optional security check)
    if (stateUserId && stateUserId !== user.id) {
      console.error('OAuth state mismatch - possible CSRF attempt');
      const errorRedirect = stateFrom === 'onboarding'
        // Step 6 is Connect Your Calendar. This said 5 — the step before it — so a
        // user who connected their calendar was dropped on "Set Up Your AI" and
        // reasonably concluded it had failed. It drifted when the number and
        // business steps were reordered; a step index hardcoded in another file
        // cannot survive that, so onboarding now resolves the step from
        // calendar_connected and treats this number as a hint.
        ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding?step=6&calendar_error=invalid_state`
        : `${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=invalid_state`;
      return NextResponse.redirect(errorRedirect);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/oauth/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?calendar_error=token_error`);
    }

    // Save tokens to Supabase using authenticated user ID.
    //
    // SERVICE ROLE. None of the three google_calendar_* columns is writable by
    // `authenticated` — public.users accepts only business_hours, business_name,
    // timezone and updated_at from that role — so this returned 42501 and
    // redirected to ?calendar_error=save_error. It failed loudly, at least, but a
    // user connecting Google Calendar today cannot succeed (#187).
    //
    // One account does hold tokens, from before the grants were tightened. That is
    // why this looked like a working feature.
    //
    // user.id comes from the verified session, not from the OAuth `state` param —
    // state is validated separately and never trusted as identity.
    const { error: updateError } = await createServiceRoleClient()
      .from('users')
      .update({
        google_calendar_access_token: tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token,
        google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error saving calendar tokens:', updateError);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=save_error`);
    }

    const successRedirect = stateFrom === 'onboarding'
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/onboarding?step=6&calendar_connected=true`
      : `${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_connected=true`;
    return NextResponse.redirect(successRedirect);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/email?calendar_error=unexpected`);
  }
}

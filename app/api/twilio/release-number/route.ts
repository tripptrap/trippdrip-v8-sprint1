// API Route: Release/Delete Phone Number from Twilio (using user's subaccount)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTwilioCredentials } from '@/lib/twilioSubaccounts';

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's Twilio subaccount credentials
    const credentialsResult = await getUserTwilioCredentials(user.id);

    if (!credentialsResult.success || !credentialsResult.accountSid || !credentialsResult.authToken) {
      return NextResponse.json(
        { error: 'No Twilio subaccount found. Please contact support.' },
        { status: 403 }
      );
    }

    const { phoneSid } = await req.json();

    if (!phoneSid) {
      return NextResponse.json(
        { error: 'Phone SID is required' },
        { status: 400 }
      );
    }

    const accountSid = credentialsResult.accountSid;
    const authToken = credentialsResult.authToken;

    // Release the phone number via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`;

    const response = await fetch(twilioUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (!response.ok && response.status !== 204) {
      const error = await response.json();
      console.error('Twilio release error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Failed to release phone number',
          details: error
        },
        { status: response.status }
      );
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('user_twilio_numbers')
      .delete()
      .eq('phone_sid', phoneSid)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Error deleting phone number from database:', dbError);
      // Continue anyway - number was released from Twilio
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number released successfully'
    });

  } catch (error: any) {
    console.error('Phone number release error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Route: Purchase Phone Number from Twilio (using user's subaccount)

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

    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const accountSid = credentialsResult.accountSid;
    const authToken = credentialsResult.authToken;

    // Purchase the phone number via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`;

    const params = new URLSearchParams();
    params.append('PhoneNumber', phoneNumber);

    // Configure SMS webhook to receive incoming messages
    const smsWebhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/sms-webhook`;
    params.append('SmsUrl', smsWebhookUrl);
    params.append('SmsMethod', 'POST');

    // Configure status callback for message delivery tracking
    const statusCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/status-callback`;
    params.append('StatusCallback', statusCallbackUrl);
    params.append('StatusCallbackMethod', 'POST');

    // Configure voice webhook for incoming calls
    const voiceWebhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/voice-webhook`;
    params.append('VoiceUrl', voiceWebhookUrl);
    params.append('VoiceMethod', 'POST');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Twilio purchase error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Failed to purchase phone number',
          details: error
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Save the purchased number to the database
    const { error: dbError } = await supabase
      .from('user_twilio_numbers')
      .insert({
        user_id: user.id,
        phone_number: result.phone_number,
        phone_sid: result.sid,
        friendly_name: result.friendly_name || result.phone_number,
        capabilities: {
          voice: result.capabilities?.voice || false,
          sms: result.capabilities?.sms || false,
          mms: result.capabilities?.mms || false,
          rcs: false
        },
        is_primary: false, // First number will be set as primary manually
        status: 'active',
        purchased_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Error saving phone number to database:', dbError);
      // Continue anyway - number was purchased successfully
    } else {
      console.log(`✅ Saved phone number ${result.phone_number} for user ${user.id}`);
    }

    return NextResponse.json({
      success: true,
      phoneNumber: result.phone_number,
      sid: result.sid,
      friendlyName: result.friendly_name,
      capabilities: {
        voice: result.capabilities?.voice || false,
        sms: result.capabilities?.sms || false,
        mms: result.capabilities?.mms || false
      },
      dateCreated: result.date_created
    });

  } catch (error: any) {
    console.error('Phone number purchase error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Route: Release/Delete Phone Number from Twilio

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { accountSid, authToken, phoneSid } = await req.json();

    if (!accountSid || !authToken || !phoneSid) {
      return NextResponse.json(
        { error: 'Missing required fields: accountSid, authToken, phoneSid' },
        { status: 400 }
      );
    }

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

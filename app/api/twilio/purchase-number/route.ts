// API Route: Purchase Phone Number from Twilio

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { accountSid, authToken, phoneNumber } = await req.json();

    if (!accountSid || !authToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: accountSid, authToken, phoneNumber' },
        { status: 400 }
      );
    }

    // Purchase the phone number via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`;

    const params = new URLSearchParams();
    params.append('PhoneNumber', phoneNumber);

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

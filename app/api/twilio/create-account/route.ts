// API Route: Create Twilio Subaccount for User

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { friendlyName } = await req.json();

    // Get master Twilio credentials from environment
    const masterAccountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
    const masterAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

    if (!masterAccountSid || !masterAuthToken) {
      return NextResponse.json(
        {
          error: 'Twilio master account not configured. Please add TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN to environment variables.',
          setup: true
        },
        { status: 400 }
      );
    }

    // Create subaccount via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts.json`;

    const params = new URLSearchParams();
    params.append('FriendlyName', friendlyName || 'TrippDrip User Account');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${masterAccountSid}:${masterAuthToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Twilio account creation error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Failed to create Twilio account',
          details: error
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      accountSid: result.sid,
      authToken: result.auth_token,
      friendlyName: result.friendly_name,
      status: result.status,
      dateCreated: result.date_created
    });

  } catch (error: any) {
    console.error('Account creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

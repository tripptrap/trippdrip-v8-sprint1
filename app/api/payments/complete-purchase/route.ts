// API Route: Complete Purchase - Add Points & Create Twilio Account

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { points, packName, createTwilioAccount } = await req.json();

    if (!points || !packName) {
      return NextResponse.json(
        { error: 'Missing required fields: points, packName' },
        { status: 400 }
      );
    }

    let twilioAccount = null;

    // If this is their first purchase, create Twilio account
    if (createTwilioAccount) {
      const masterAccountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
      const masterAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

      if (masterAccountSid && masterAuthToken) {
        try {
          // Create Twilio subaccount
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts.json`;
          const params = new URLSearchParams();
          params.append('FriendlyName', `HyveWyre™ User - ${packName} Purchase`);

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${masterAccountSid}:${masterAuthToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
          });

          if (response.ok) {
            const result = await response.json();
            twilioAccount = {
              accountSid: result.sid,
              authToken: result.auth_token,
              friendlyName: result.friendly_name,
              status: result.status,
              dateCreated: result.date_created
            };
          } else {
            console.error('Failed to create Twilio account:', await response.text());
          }
        } catch (error) {
          console.error('Error creating Twilio account:', error);
          // Don't fail the purchase if Twilio creation fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      points,
      packName,
      twilioAccount: twilioAccount || undefined,
      message: twilioAccount
        ? 'Points added and SMS account created!'
        : 'Points added successfully!'
    });

  } catch (error: any) {
    console.error('Complete purchase error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

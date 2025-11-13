// API Route: Search Available Phone Numbers (using user's subaccount)

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

    const { countryCode = 'US', areaCode, contains, tollFree = false } = await req.json();
    const accountSid = credentialsResult.accountSid;
    const authToken = credentialsResult.authToken;

    // Determine number type (TollFree or Local)
    const numberType = tollFree ? 'TollFree' : 'Local';

    // Build search URL with filters
    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${countryCode}/${numberType}.json`;
    const params = new URLSearchParams();

    // For local numbers, add area code and contains filters
    if (!tollFree) {
      if (areaCode) {
        params.append('AreaCode', areaCode);
      }
      if (contains) {
        params.append('Contains', contains);
      }
    }

    const searchUrl = `${baseUrl}?${params.toString()}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Twilio search error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Failed to search phone numbers',
          details: error
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Format the available phone numbers
    const availableNumbers = result.available_phone_numbers?.map((num: any) => ({
      phoneNumber: num.phone_number,
      friendlyName: num.friendly_name,
      locality: num.locality,
      region: num.region,
      postalCode: num.postal_code,
      isoCountry: num.iso_country,
      capabilities: {
        voice: num.capabilities?.voice || false,
        sms: num.capabilities?.sms || false,
        mms: num.capabilities?.mms || false
      }
    })) || [];

    return NextResponse.json({
      success: true,
      numbers: availableNumbers,
      total: availableNumbers.length
    });

  } catch (error: any) {
    console.error('Phone number search error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

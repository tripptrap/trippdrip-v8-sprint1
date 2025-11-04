// API Route: Search Available Phone Numbers

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { accountSid, authToken, countryCode = 'US', areaCode, contains } = await req.json();

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: 'Twilio credentials required' },
        { status: 400 }
      );
    }

    // Build search URL with filters
    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${countryCode}/Local.json`;
    const params = new URLSearchParams();

    if (areaCode) {
      params.append('AreaCode', areaCode);
    }
    if (contains) {
      params.append('Contains', contains);
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

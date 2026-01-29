// API Route: Search Available Phone Numbers from Telnyx
// Searches for local or toll-free numbers to purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const {
      countryCode = 'US',
      areaCode,
      city,
      state,
      contains,
      tollFree = false,
      limit = 20
    } = await req.json();

    const apiKey = process.env.TELNYX_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Telnyx API key not configured' },
        { status: 500 }
      );
    }

    // Build query params based on number type
    const params = new URLSearchParams();
    params.append('filter[country_code]', countryCode);
    params.append('filter[limit]', limit.toString());
    params.append('filter[features]', 'sms'); // Must support SMS

    if (tollFree) {
      // Search toll-free numbers
      params.append('filter[number_type]', 'toll-free');
    } else {
      // Search local numbers
      params.append('filter[number_type]', 'local');

      if (areaCode) {
        params.append('filter[national_destination_code]', areaCode);
      }
      if (city) {
        params.append('filter[locality]', city);
      }
      if (state) {
        params.append('filter[administrative_area]', state);
      }
      if (contains) {
        params.append('filter[phone_number][contains]', contains);
      }
    }

    // Search via Telnyx API
    const searchResponse = await fetch(
      `https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('Telnyx search error:', searchData);
      return NextResponse.json(
        { error: searchData.errors?.[0]?.detail || 'Failed to search numbers' },
        { status: searchResponse.status }
      );
    }

    // Format the results
    const numbers = (searchData.data || []).map((num: any) => ({
      phoneNumber: num.phone_number,
      friendlyName: num.phone_number,
      locality: num.locality || '',
      region: num.administrative_area || num.region_information?.[0]?.region_name || '',
      numberType: num.phone_number_type || (tollFree ? 'toll-free' : 'local'),
      capabilities: {
        voice: num.features?.includes('voice') || true,
        sms: num.features?.includes('sms') || true,
        mms: num.features?.includes('mms') || false,
      },
      monthlyPrice: num.cost_information?.monthly_cost || null,
      upfrontPrice: num.cost_information?.upfront_cost || null,
      reservable: num.reservable || false,
    }));

    console.log(`🔍 Found ${numbers.length} available ${tollFree ? 'toll-free' : 'local'} numbers`);

    return NextResponse.json({
      success: true,
      numbers,
      total: numbers.length,
      numberType: tollFree ? 'toll-free' : 'local',
    });

  } catch (error: any) {
    console.error('Search numbers error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

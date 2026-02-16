// API Route: Search Available Phone Numbers from Telnyx
// Searches for local or toll-free numbers to purchase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getVerifiedTollFreeNumbers } from '@/lib/telnyx';

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

    if (tollFree) {
      // Only return verified toll-free numbers that aren't claimed by any user
      const verifiedNumbers = await getVerifiedTollFreeNumbers();

      if (verifiedNumbers.size === 0) {
        return NextResponse.json({
          success: true,
          numbers: [],
          total: 0,
          numberType: 'toll-free',
        });
      }

      // Check which verified numbers are already claimed
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: claimedNumbers } = await supabaseAdmin
        .from('user_telnyx_numbers')
        .select('phone_number')
        .in('status', ['active', 'pending']);

      const claimedSet = new Set((claimedNumbers || []).map((n: any) => n.phone_number));

      const available = Array.from(verifiedNumbers)
        .filter(num => !claimedSet.has(num))
        .map(num => ({
          phoneNumber: num,
          friendlyName: num,
          locality: '',
          region: '',
          numberType: 'toll-free',
          capabilities: { voice: true, sms: true, mms: true },
          monthlyPrice: null,
          upfrontPrice: null,
          reservable: false,
        }));

      console.log(`🔍 Found ${available.length} available verified toll-free numbers`);

      return NextResponse.json({
        success: true,
        numbers: available,
        total: available.length,
        numberType: 'toll-free',
      });
    }

    // Local number search — unchanged
    const params = new URLSearchParams();
    params.append('filter[country_code]', countryCode);
    params.append('filter[limit]', limit.toString());
    params.append('filter[features]', 'sms');
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

    const numbers = (searchData.data || []).map((num: any) => ({
      phoneNumber: num.phone_number,
      friendlyName: num.phone_number,
      locality: num.locality || '',
      region: num.administrative_area || num.region_information?.[0]?.region_name || '',
      numberType: num.phone_number_type || 'local',
      capabilities: {
        voice: num.features?.includes('voice') || true,
        sms: num.features?.includes('sms') || true,
        mms: num.features?.includes('mms') || false,
      },
      monthlyPrice: num.cost_information?.monthly_cost || null,
      upfrontPrice: num.cost_information?.upfront_cost || null,
      reservable: num.reservable || false,
    }));

    console.log(`🔍 Found ${numbers.length} available local numbers`);

    return NextResponse.json({
      success: true,
      numbers,
      total: numbers.length,
      numberType: 'local',
    });

  } catch (error: any) {
    console.error('Search numbers error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

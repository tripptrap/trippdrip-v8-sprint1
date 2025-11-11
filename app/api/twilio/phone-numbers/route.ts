import { NextRequest, NextResponse } from 'next/server';
import { getPhoneNumbers } from '@/lib/twilio';
import { createClient } from '@/lib/supabase/server';
import twilio from 'twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/twilio/phone-numbers
 * Get list of Twilio phone numbers for the account
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const result = await getPhoneNumbers();

    if (result.success) {
      return NextResponse.json({
        ok: true,
        phoneNumbers: result.phoneNumbers,
        count: result.phoneNumbers?.length || 0,
      });
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in GET /api/twilio/phone-numbers:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to fetch phone numbers',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/twilio/phone-numbers/search
 * Search for available phone numbers to purchase
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { areaCode, country = 'US' } = body;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Twilio not configured',
        },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    // Search for available phone numbers
    const availableNumbers = await client.availablePhoneNumbers(country).local.list({
      areaCode: areaCode,
      limit: 20,
    });

    return NextResponse.json({
      ok: true,
      numbers: availableNumbers.map((num) => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality,
        region: num.region,
        capabilities: num.capabilities,
      })),
    });
  } catch (error: any) {
    console.error('Error searching phone numbers:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to search phone numbers',
      },
      { status: 500 }
    );
  }
}

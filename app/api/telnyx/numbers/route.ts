// API Route: Get Telnyx Phone Numbers
// Returns list of Telnyx phone numbers OWNED BY THE CURRENT USER ONLY

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // IMPORTANT: Only return phone numbers owned by this specific user
    // This ensures users can only see and use their own numbers
    const { data: userNumbers, error: numbersError } = await supabase
      .from('user_telnyx_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (numbersError) {
      console.error('Error fetching user numbers:', numbersError);
      return NextResponse.json(
        { error: 'Failed to fetch phone numbers' },
        { status: 500 }
      );
    }

    // Format numbers for the response
    const numbers = (userNumbers || []).map((num, index) => ({
      phone_number: num.phone_number,
      friendly_name: num.friendly_name || num.phone_number,
      is_primary: num.is_primary || index === 0,
      status: num.status,
    }));

    return NextResponse.json({
      success: true,
      numbers,
    });
  } catch (error) {
    console.error('Error fetching Telnyx numbers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Route: Get Telnyx Phone Numbers
// Returns list of Telnyx phone numbers for the messaging profile

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTelnyxNumbers } from '@/lib/telnyx';

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

    // Get Telnyx phone numbers
    const result = await getTelnyxNumbers();

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch Telnyx numbers' },
        { status: 500 }
      );
    }

    // Add is_primary flag (first number is primary by default)
    const numbers = result.numbers?.map((num, index) => ({
      ...num,
      is_primary: index === 0,
    })) || [];

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

// API Route: Get User's Twilio Phone Numbers
// Returns list of Twilio phone numbers owned by the authenticated user

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTwilioNumbers } from '@/lib/twilioSubaccounts';

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

    // Get user's Twilio phone numbers
    const result = await getUserTwilioNumbers(user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch Twilio numbers' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      numbers: result.numbers,
    });
  } catch (error) {
    console.error('Error fetching Twilio numbers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

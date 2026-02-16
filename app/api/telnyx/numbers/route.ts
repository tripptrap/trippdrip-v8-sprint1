// API Route: Get Telnyx Phone Numbers
// Returns list of Telnyx phone numbers OWNED BY THE CURRENT USER ONLY
// Auto-releases any unverified toll-free numbers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getVerifiedTollFreeNumbers, isTollFreeNumber } from '@/lib/telnyx';

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
    // Include both 'active' and 'pending' so users can see numbers being provisioned
    const { data: userNumbers, error: numbersError } = await supabase
      .from('user_telnyx_numbers')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: true });

    if (numbersError) {
      console.error('Error fetching user numbers:', numbersError);
      return NextResponse.json(
        { error: 'Failed to fetch phone numbers' },
        { status: 500 }
      );
    }

    // Auto-release unverified toll-free numbers
    const verifiedNumbers = await getVerifiedTollFreeNumbers();
    const releasedNumbers: string[] = [];

    const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
      : null;

    for (const num of userNumbers || []) {
      if (isTollFreeNumber(num.phone_number) && !verifiedNumbers.has(num.phone_number)) {
        console.log(`Auto-releasing unverified toll-free number ${num.phone_number} from user ${user.id}`);

        if (supabaseAdmin) {
          // Delete from user_telnyx_numbers
          await supabaseAdmin
            .from('user_telnyx_numbers')
            .delete()
            .eq('phone_number', num.phone_number)
            .eq('user_id', user.id);

          // Release from Telnyx account
          const apiKey = process.env.TELNYX_API_KEY;
          if (apiKey) {
            try {
              const listRes = await fetch(
                `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(num.phone_number)}`,
                { headers: { 'Authorization': `Bearer ${apiKey}` } }
              );
              const listData = await listRes.json();
              const telnyxId = listData.data?.[0]?.id;
              if (telnyxId) {
                await fetch(`https://api.telnyx.com/v2/phone_numbers/${telnyxId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${apiKey}` },
                });
              }
            } catch (e) {
              console.error(`Failed to release ${num.phone_number} from Telnyx:`, e);
            }
          }

          // Mark as unassigned in number_pool if it was from there
          await supabaseAdmin
            .from('number_pool')
            .update({ is_assigned: false, assigned_to_user_id: null, assigned_at: null })
            .eq('phone_number', num.phone_number);
        }

        releasedNumbers.push(num.phone_number);
      }
    }

    // Filter out released numbers
    const activeNumbers = (userNumbers || []).filter(
      num => !releasedNumbers.includes(num.phone_number)
    );

    // Format numbers for the response
    const numbers = activeNumbers.map((num, index) => ({
      phone_number: num.phone_number,
      friendly_name: num.friendly_name || num.phone_number,
      is_primary: num.is_primary || index === 0,
      status: num.status,
    }));

    return NextResponse.json({
      success: true,
      numbers,
      ...(releasedNumbers.length > 0 && {
        numbersReleased: releasedNumbers,
        releaseMessage: `${releasedNumbers.length} unverified toll-free number(s) were released. Please claim a verified number.`,
      }),
    });
  } catch (error) {
    console.error('Error fetching Telnyx numbers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

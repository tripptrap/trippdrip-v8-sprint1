// API Route: Get Telnyx Phone Numbers
// Returns list of Telnyx phone numbers OWNED BY THE CURRENT USER ONLY
// Auto-releases any unverified toll-free numbers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getVerifiedTollFreeNumbers, isTollFreeNumber } from '@/lib/telnyx';
import { releasePoolNumber } from '@/lib/numberPool';

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

          // Return it to the pool through the shared helper so it is quarantined
          // and its tenancy recorded (#38). A number auto-released for losing
          // toll-free verification is the last one that should go straight to a
          // different business, and the history is how anyone later works out
          // that it lost TFV under a previous holder.
          await releasePoolNumber(supabaseAdmin, num.phone_number, user.id, 'unverified_auto_release');
        }

        releasedNumbers.push(num.phone_number);
      }
    }

    // Filter out released numbers
    const activeNumbers = (userNumbers || []).filter(
      num => !releasedNumbers.includes(num.phone_number)
    );

    // Format numbers for the response.
    //
    // Rebuilding each row narrowly is what dropped `capabilities` before — the
    // DB query selects `*`, so anything omitted here silently disappears from
    // the API even though it exists. Routing state is added for the same reason
    // it was needed then: the UI cannot show what the endpoint does not return.
    const numbers = activeNumbers.map((num, index) => ({
      id: num.id,
      phone_number: num.phone_number,
      friendly_name: num.friendly_name || num.phone_number,
      is_primary: num.is_primary || index === 0,
      status: num.status,
      capabilities: num.capabilities || { voice: true, sms: true, mms: true },
      purchased_at: num.created_at,
      locked_until: num.locked_until ?? null,
      rested_until: num.rested_until ?? null,
      rest_reason: num.rest_reason ?? null,
    }));

    // Routing mode lives on user_settings, not on any number, but the page that
    // renders the numbers is the page that sets it — so it ships together.
    // Read with the request-scoped client, not supabaseAdmin — that one is
    // conditionally null above, and this is the user reading their own row.
    const { data: settingsRow } = await supabase
      .from('user_settings')
      .select('number_selection_mode')
      .eq('user_id', user.id)
      .maybeSingle();
    const numberSelectionMode = settingsRow?.number_selection_mode || 'geo';

    return NextResponse.json({
      success: true,
      numbers,
      numberSelectionMode,
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

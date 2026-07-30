// API Route: Get available numbers from the pool
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isTollFreeNumber, getVerifiedTollFreeNumbers } from '@/lib/telnyx';
import { isQuarantined, QUARANTINE_DAYS } from '@/lib/numberPool';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function GET(req: NextRequest) {
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

    // Get available verified numbers from pool
    const { data: availableNumbers, error } = await supabase
      .from('number_pool')
      .select('*')
      .eq('is_assigned', false)
      .eq('is_verified', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching available numbers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available numbers' },
        { status: 500 }
      );
    }

    // Reconcile the DB flag against Telnyx before offering these (#36).
    // `is_verified` is written once by a seed migration and never refreshed, so
    // on its own it can't notice verification being rejected or revoked. This
    // is the read path users pick numbers from, so it's the right place to
    // catch drift — and `getVerifiedTollFreeNumbers()` is cached for 5 minutes,
    // so this doesn't hit Telnyx on every request.
    let numbers = availableNumbers || [];
    try {
      const verified = await getVerifiedTollFreeNumbers();
      const stale = numbers.filter(
        (n: any) => isTollFreeNumber(n.phone_number) && !verified.has(n.phone_number)
      );

      if (stale.length > 0) {
        console.error(
          `⚠️ ${stale.length} pool number(s) marked is_verified but not verified with Telnyx: ${stale.map((n: any) => n.phone_number).join(', ')} — hiding and correcting the flag.`
        );
        numbers = numbers.filter((n: any) => !stale.some((s: any) => s.id === n.id));

        if (supabaseAdmin) {
          await supabaseAdmin
            .from('number_pool')
            .update({ is_verified: false })
            .in('id', stale.map((n: any) => n.id));
        }
      }
    } catch (verifyErr) {
      // Don't fail the listing if Telnyx is unreachable — the claim path
      // re-checks before actually assigning anything.
      console.error('Could not reconcile pool verification against Telnyx:', verifyErr);
    }

    // Offer rested numbers first (#38). A number inside its cooldown is only
    // surfaced when there is nothing else — the claim path allows it in exactly
    // that case, so showing it any earlier would advertise a number the user
    // would then be refused.
    const rested = numbers.filter((n: any) => !isQuarantined(n));
    const resting = numbers.filter((n: any) => isQuarantined(n));
    const offered = rested.length > 0 ? rested : resting;

    if (rested.length === 0 && resting.length > 0) {
      console.warn(
        `⚠️ Every available pool number is inside its ${QUARANTINE_DAYS}-day cooldown; offering ${resting.length} recycled number(s).`
      );
    }

    return NextResponse.json({
      success: true,
      numbers: offered,
      total: offered.length,
      // True when everything on offer is a number another business recently
      // used, so the UI can say so rather than implying a fresh number.
      recycled: rested.length === 0 && resting.length > 0,
    });

  } catch (error: any) {
    console.error('Get available numbers error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

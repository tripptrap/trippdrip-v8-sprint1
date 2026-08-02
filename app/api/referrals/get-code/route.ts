import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// The privileged RPC runs on the service-role client, not the caller's (#114).
//
// These functions are SECURITY DEFINER and take the tenant as a parameter, so
// EXECUTE granted to `authenticated` meant any logged-in user could call them
// directly over PostgREST with someone else's user_id — bypassing this route
// entirely. The grant is revoked; the route keeps working because it now calls
// as service_role.
//
// The tenant still comes from the verified session below, never from the body.

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create referral code for user
    const { data, error } = await createServiceRoleClient().rpc('get_or_create_referral_code', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error getting referral code:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, error: 'Failed to get referral code' }, { status: 500 });
    }

    const codeData = data[0];

    return NextResponse.json({
      ok: true,
      code: codeData.code,
      totalReferrals: codeData.total_referrals,
      successfulReferrals: codeData.successful_referrals,
      createdAt: codeData.created_at
    });

  } catch (error: any) {
    console.error('Error in get-code route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

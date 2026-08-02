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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { referralId } = body;

    if (!referralId) {
      return NextResponse.json({ ok: false, error: 'Referral ID is required' }, { status: 400 });
    }

    // Complete referral and grant rewards
    const { data, error } = await createServiceRoleClient().rpc('complete_referral', {
      p_referral_id: referralId
    });

    if (error) {
      console.error('Error completing referral:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      rewardId: result.reward_id,
      expiresAt: result.expires_at,
      message: result.message
    });

  } catch (error: any) {
    console.error('Error in complete route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

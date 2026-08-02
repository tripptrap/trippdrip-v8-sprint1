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
    const { referralCode } = body;

    if (!referralCode) {
      return NextResponse.json({ ok: false, error: 'Referral code is required' }, { status: 400 });
    }

    // Apply referral code
    const { data, error } = await createServiceRoleClient().rpc('apply_referral_code', {
      p_referred_user_id: user.id,
      p_referral_code: referralCode.toUpperCase()
    });

    if (error) {
      console.error('Error applying referral code:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      referralId: result.referral_id,
      message: result.message
    });

  } catch (error: any) {
    console.error('Error in apply-code route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

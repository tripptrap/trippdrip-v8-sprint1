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
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json({ ok: false, error: 'Phone number is required' }, { status: 400 });
    }

    // Check DNC list
    const { data, error } = await createServiceRoleClient().rpc('check_dnc', {
      p_user_id: user.id,
      p_phone_number: phoneNumber
    });

    if (error) {
      console.error('Error checking DNC:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    return NextResponse.json({
      ok: true,
      ...result
    });

  } catch (error: any) {
    console.error('Error in check DNC route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

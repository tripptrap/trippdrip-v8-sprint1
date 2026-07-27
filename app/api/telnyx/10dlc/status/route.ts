import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: registration } = await supabase
      .from('user_10dlc_registrations')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: primaryNumber } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      registration: registration || null,
      primaryPhoneNumber: primaryNumber?.phone_number || null,
    });
  } catch (error: any) {
    console.error('Error in GET /api/telnyx/10dlc/status:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

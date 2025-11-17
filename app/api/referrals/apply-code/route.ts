import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { data, error } = await supabase.rpc('apply_referral_code', {
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

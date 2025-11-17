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
    const { referralId } = body;

    if (!referralId) {
      return NextResponse.json({ ok: false, error: 'Referral ID is required' }, { status: 400 });
    }

    // Complete referral and grant rewards
    const { data, error } = await supabase.rpc('complete_referral', {
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

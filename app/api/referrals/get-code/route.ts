import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create referral code for user
    const { data, error } = await supabase.rpc('get_or_create_referral_code', {
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

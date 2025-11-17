import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get referral stats
    const { data, error } = await supabase.rpc('get_referral_stats', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error getting referral stats:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const stats = typeof data === 'string' ? JSON.parse(data) : data;

    // Get list of referrals
    const { data: referrals, error: referralsError } = await supabase
      .from('referrals')
      .select('id, referred_user_id, status, created_at, completed_at, reward_granted_at')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false });

    if (referralsError) {
      console.error('Error getting referrals list:', referralsError);
    }

    // Get active rewards
    const { data: rewards, error: rewardsError } = await supabase
      .from('referral_rewards')
      .select('id, reward_type, reward_value, granted_at, expires_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('granted_at', { ascending: false });

    if (rewardsError) {
      console.error('Error getting rewards:', rewardsError);
    }

    return NextResponse.json({
      ok: true,
      stats,
      referrals: referrals || [],
      rewards: rewards || []
    });

  } catch (error: any) {
    console.error('Error in stats route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

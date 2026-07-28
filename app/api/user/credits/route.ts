import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // tier/monthly_credits are additive here so /points can read balance and
    // plan from one authenticated server call instead of its own client-side
    // Supabase query, which silently returned zeros whenever the browser-side
    // auth check transiently failed (issue #6).
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('credits, subscription_tier, monthly_credits')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('Error fetching credits:', fetchError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch credits' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      credits: userData?.credits || 0,
      subscriptionTier: userData?.subscription_tier ?? null,
      monthlyCredits: userData?.monthly_credits ?? null,
    });
  } catch (error: any) {
    console.error('Error in credits API:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

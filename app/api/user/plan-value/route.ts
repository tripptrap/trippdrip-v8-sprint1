// API Route: This billing cycle's usage + savings, for the "plan value"
// nudge on /points — surfaces real value before the renewal decision
// instead of only at cancellation time. See GitHub issue #15.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Must match POINT_PACKS in app/(dashboard)/points/page.tsx — used to look
// up the undiscounted list price for a purchased pack size so we can show
// how much the tier's discount actually saved on top of what Stripe charged.
const PACK_BASE_PRICES: Record<number, number> = {
  4000: 40,
  10000: 95,
  25000: 225,
  60000: 510,
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('last_renewal_date, monthly_credits, subscription_tier')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ ok: false, error: 'Failed to load account' }, { status: 500 });
    }

    // No renewal date yet (e.g. unpaid account) — nothing to report.
    if (!userData.last_renewal_date) {
      return NextResponse.json({
        ok: true,
        creditsUsedThisCycle: 0,
        monthlyCredits: userData.monthly_credits || 0,
        savedThisCycle: 0,
      });
    }

    const { data: cycleTransactions, error: txError } = await supabase
      .from('points_transactions')
      .select('action_type, points_amount, amount_paid')
      .eq('user_id', user.id)
      .gte('created_at', userData.last_renewal_date);

    if (txError) {
      return NextResponse.json({ ok: false, error: 'Failed to load usage' }, { status: 500 });
    }

    let creditsUsedThisCycle = 0;
    let savedThisCycle = 0;

    for (const tx of cycleTransactions || []) {
      if (tx.points_amount < 0) {
        creditsUsedThisCycle += Math.abs(tx.points_amount);
      }
      // Only count real Stripe purchases (amount_paid > 0) toward savings —
      // some historical rows were granted with no charge and would show a
      // misleading 100%-off "savings" figure otherwise.
      if (tx.action_type === 'purchase' && tx.amount_paid > 0) {
        const basePrice = PACK_BASE_PRICES[tx.points_amount];
        if (basePrice) {
          const paid = tx.amount_paid / 100;
          if (basePrice > paid) {
            savedThisCycle += basePrice - paid;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      creditsUsedThisCycle,
      monthlyCredits: userData.monthly_credits || 0,
      savedThisCycle: Math.round(savedThisCycle * 100) / 100,
    });
  } catch (error: any) {
    console.error('Error in GET /api/user/plan-value:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

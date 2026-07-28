// API Route: Change subscription plan (Growth <-> Scale)
// Actually updates the Stripe subscription's price — the /points page
// buttons used to only write subscription_tier to Supabase, which never
// touched real billing. See GitHub issue #12-#15 for background.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Must match the fallbacks in create-checkout/route.ts and webhook/route.ts.
const STRIPE_PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || 'price_1SQtYHFyk0lZUopFNa0lT81K';
const STRIPE_PRICE_SCALE = process.env.STRIPE_PRICE_SCALE || 'price_1SQtaUFyk0lZUopFRJnuLftL';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { planType } = await req.json();
    if (planType !== 'growth' && planType !== 'scale') {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_tier, stripe_subscription_id, credits')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'Failed to load account' }, { status: 500 });
    }

    const oldPlan = userData.subscription_tier;
    if (oldPlan === planType) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 });
    }

    if (!userData.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active Stripe subscription found on your account. Please contact support to change your plan.' },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecretKey);

    const subscription = await stripe.subscriptions.retrieve(userData.stripe_subscription_id);
    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      return NextResponse.json({ error: 'Subscription has no billable item' }, { status: 500 });
    }

    const newPriceId = planType === 'scale' ? STRIPE_PRICE_SCALE : STRIPE_PRICE_GROWTH;

    // Actually change what the customer is billed. create_prorations credits/
    // charges the difference on the next invoice — standard behavior for
    // plan changes, avoids either side losing money on the switch.
    await stripe.subscriptions.update(userData.stripe_subscription_id, {
      items: [{ id: subscriptionItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });

    const newMonthlyCredits = planType === 'scale' ? 10000 : 3000;
    const updateData: Record<string, any> = {
      subscription_tier: planType,
      plan_type: planType,
      monthly_credits: newMonthlyCredits,
      updated_at: new Date().toISOString(),
    };
    // Preserve balance on downgrade; top up immediately on upgrade.
    if (planType === 'scale' && oldPlan === 'growth') {
      updateData.credits = (userData.credits || 0) + newMonthlyCredits;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Stripe subscription updated but Supabase write failed:', updateError);
      return NextResponse.json(
        { error: 'Plan changed with Stripe but failed to save locally. Please contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, planType, monthlyCredits: newMonthlyCredits });
  } catch (error: any) {
    console.error('Error in POST /api/stripe/change-plan:', error);
    return NextResponse.json({ error: error.message || 'Failed to change plan' }, { status: 500 });
  }
}

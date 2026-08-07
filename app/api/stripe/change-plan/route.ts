// API Route: Change subscription plan (Growth <-> Scale)
// Actually updates the Stripe subscription's price — the /points page
// buttons used to only write subscription_tier to Supabase, which never
// touched real billing. See GitHub issue #12-#15 for background.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
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

    // A subscription that is not currently being paid must not buy an upgrade.
    // subscriptions.update() succeeds for past_due, unpaid and incomplete, so
    // without this a card that has been declining for months could still take the
    // Scale top-up. Downgrades stay allowed from any status — never trap someone
    // on the expensive plan because their card is failing (#163).
    const BILLABLE = ['active', 'trialing'];
    if (planType === 'scale' && !BILLABLE.includes(subscription.status)) {
      return NextResponse.json(
        { error: `Your subscription is ${subscription.status}. Please update your payment method before upgrading.` },
        { status: 402 }
      );
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
    // ── Service-role client, and the credit top-up via add_credits ──────────
    //
    // This whole UPDATE ran on the SESSION client and could never have
    // succeeded: column grants let `authenticated` write only business_hours,
    // business_name, timezone and updated_at on public.users. subscription_tier,
    // plan_type, monthly_credits and credits are all refused, so Postgres
    // rejected the statement AFTER Stripe had already been charged, and the user
    // was told to contact support. Every plan change, in both directions (#137).
    //
    // The top-up is no longer folded into this UPDATE either. It was
    // `credits = (userData.credits || 0) + newMonthlyCredits`, a read-then-write
    // off a balance read earlier in the request, so anything the user spent in
    // between was handed back. add_credits adds a delta atomically and writes
    // the ledger row in the same transaction.
    const admin = createServiceRoleClient();

    const { error: updateError } = await admin
      .from('users')
      .update(updateData)
      .eq('id', user.id);

    // Preserve balance on downgrade; top up ONCE PER BILLING PERIOD on upgrade.
    //
    // ── Why the idempotency key ────────────────────────────────────────────────
    //
    // This granted a full 10,000 credits on every growth->scale transition, with
    // nothing recording that it had done so. Because a downgrade deliberately
    // preserves the balance (the comment above), the pair was a money printer:
    //
    //   for (;;) { POST {planType:'scale'}; POST {planType:'growth'} }
    //
    // Each iteration saw oldPlan === 'growth' again and granted another 10,000 —
    // a full $98 Scale month per lap. proration_behavior 'create_prorations' only
    // writes proration lines onto the NEXT invoice, and an up-then-immediately-down
    // pair nets to about zero, so the laps were free. No rate limit applies:
    // middleware.ts excludes /api, and nothing under app/api/stripe/ imports
    // lib/rateLimit (#153).
    //
    // The fix is a deterministic stripe_session_id. points_transactions carries two
    // partial unique indexes on it — (stripe_session_id) and (user_id,
    // stripe_session_id), both WHERE stripe_session_id IS NOT NULL — and
    // add_credits does its UPDATE and its ledger INSERT inside one plpgsql
    // function. So a duplicate key raises 23505 and rolls the credit grant back
    // with it. The idempotency is atomic rather than checked-then-acted.
    //
    // Keyed on the billing period, so a genuine upgrade next cycle still tops up.
    const periodStart =
      (subscriptionItem as any).current_period_start ??
      (subscription as any).current_period_start ??
      null;
    // Never fall back to something that varies per request — that would restore
    // the unlimited loop. A month bucket is the coarsest safe fallback.
    const periodKey = periodStart ?? `month-${new Date().toISOString().slice(0, 7)}`;
    const grantKey = `plan-upgrade:${user.id}:${periodKey}`;

    let alreadyGranted = false;

    if (!updateError && planType === 'scale' && oldPlan === 'growth') {
      const { error: topUpError } = await admin.rpc('add_credits', {
        user_id: user.id,
        amount: newMonthlyCredits,
        action_type: 'subscription',
        reason: `Upgrade to Scale — ${newMonthlyCredits.toLocaleString()} credits`,
        stripe_session_id: grantKey,
      });

      if (topUpError?.code === '23505') {
        // Already topped up this billing period. Not an error: the plan change
        // itself is legitimate and has gone through, so report success without
        // granting again.
        alreadyGranted = true;
        console.log(`Plan upgrade for ${user.id}: credits already granted for this period (${grantKey})`);
      } else if (topUpError) {
        // The plan is already switched with Stripe and locally; refusing here
        // would misreport a change that did happen. Make it loud instead.
        console.error(`Plan upgraded for ${user.id} but the ${newMonthlyCredits}-credit top-up failed:`, topUpError);
      }
    }

    if (updateError) {
      console.error('Stripe subscription updated but Supabase write failed:', updateError);
      return NextResponse.json(
        { error: 'Plan changed with Stripe but failed to save locally. Please contact support.' },
        { status: 500 }
      );
    }

    // creditsGranted lets the UI stop celebrating a top-up that did not happen —
    // /points fires its animation off this response (#164).
    return NextResponse.json({
      ok: true,
      planType,
      monthlyCredits: newMonthlyCredits,
      creditsGranted: planType === 'scale' && oldPlan === 'growth' && !alreadyGranted,
    });
  } catch (error: any) {
    console.error('Error in POST /api/stripe/change-plan:', error);
    return NextResponse.json({ error: error.message || 'Failed to change plan' }, { status: 500 });
  }
}

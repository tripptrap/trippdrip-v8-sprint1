// API Route: Pause/resume billing on the current subscription.
// Alternative to downgrading — keeps the current tier and (once #11 ties
// campaign use-case to subscription tier) the 10DLC campaign registration
// intact, since the plan itself never changes. See GitHub issue #14.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getSubscription(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();
  if (error || !data?.stripe_subscription_id) return null;
  return data.stripe_subscription_id as string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { cycles } = await req.json();
    if (cycles !== 1 && cycles !== 2) {
      return NextResponse.json({ error: 'cycles must be 1 or 2' }, { status: 400 });
    }

    const subscriptionId = await getSubscription(supabase, user.id);
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'No active Stripe subscription found on your account. Please contact support.' },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecretKey);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    if (!item) {
      return NextResponse.json({ error: 'Subscription has no billable item' }, { status: 500 });
    }

    // Skip `cycles` upcoming renewals: resume at the end of the (cycles)th
    // billing period from now, aligned to the subscription's own renewal
    // date rather than a flat 30/60 days.
    const resumeDate = new Date(item.current_period_end * 1000);
    resumeDate.setMonth(resumeDate.getMonth() + (cycles - 1));
    const resumesAt = Math.floor(resumeDate.getTime() / 1000);

    await stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'void', resumes_at: resumesAt },
    });

    const { error: updateError } = await supabase
      .from('users')
      .update({
        subscription_status: 'paused',
        pause_resumes_at: resumeDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Subscription paused in Stripe but Supabase write failed:', updateError);
      return NextResponse.json(
        { error: 'Billing paused with Stripe but failed to save locally. Please contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, resumesAt: resumeDate.toISOString() });
  } catch (error: any) {
    console.error('Error in POST /api/stripe/pause-subscription:', error);
    return NextResponse.json({ error: error.message || 'Failed to pause billing' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const subscriptionId = await getSubscription(supabase, user.id);
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'No active Stripe subscription found on your account. Please contact support.' },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecretKey);

    await stripe.subscriptions.update(subscriptionId, { pause_collection: '' });

    const { error: updateError } = await supabase
      .from('users')
      .update({
        subscription_status: 'active',
        pause_resumes_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Subscription resumed in Stripe but Supabase write failed:', updateError);
      return NextResponse.json(
        { error: 'Billing resumed with Stripe but failed to save locally. Please contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/stripe/pause-subscription:', error);
    return NextResponse.json({ error: error.message || 'Failed to resume billing' }, { status: 500 });
  }
}

// API Route: Create Stripe Checkout Session

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

// Stripe Price IDs
const STRIPE_PRICES = {
  subscriptions: {
    growth: 'price_1SQtYHFyk0lZUopFNa0lT81K',
    scale: 'price_1SQtaUFyk0lZUopFRJnuLftL'
  },
  pointPacks: {
    growth: {
      starter: 'price_1SQtbMFyk0lZUopFleqbdgVZ',
      pro: 'price_1SQtbuFyk0lZUopFbBFafou0',
      business: 'price_1SQtciFyk0lZUopFP2ATsGyR',
      enterprise: 'price_1SQtdJFyk0lZUopFuSaGfzU3'
    },
    scale: {
      starter: 'price_1SQtduFyk0lZUopFApnLorDd',
      pro: 'price_1SQteQFyk0lZUopF63RURC72',
      business: 'price_1SQteyFyk0lZUopFH9S2ebtD',
      enterprise: 'price_1SQtfRFyk0lZUopFlv2sFszH'
    }
  }
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { points, price, packName, planType, subscriptionType } = await req.json();

    // Validate inputs for point packs
    if (!subscriptionType && (!points || !price || !packName)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for Stripe API key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error: 'Stripe not configured. Please add STRIPE_SECRET_KEY to your environment variables.',
          setup: true
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey);

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();

    // Determine which Price ID to use
    let priceId: string | null = null;
    let mode: 'subscription' | 'payment' = 'payment';
    let successUrl = `${baseUrl}/points?success=true&session_id={CHECKOUT_SESSION_ID}`;

    if (subscriptionType) {
      // Handle subscription checkout
      mode = 'subscription';
      successUrl = `${baseUrl}/auth/onboarding?step=2&success=true&session_id={CHECKOUT_SESSION_ID}`;
      priceId = subscriptionType === 'scale'
        ? STRIPE_PRICES.subscriptions.scale
        : STRIPE_PRICES.subscriptions.growth;
    } else {
      // Handle point pack checkout
      const userPlan = planType === 'scale' ? 'scale' : 'growth';
      const packType = packName.toLowerCase();

      if (packType.includes('starter')) {
        priceId = STRIPE_PRICES.pointPacks[userPlan].starter;
      } else if (packType.includes('pro')) {
        priceId = STRIPE_PRICES.pointPacks[userPlan].pro;
      } else if (packType.includes('business')) {
        priceId = STRIPE_PRICES.pointPacks[userPlan].business;
      } else if (packType.includes('enterprise')) {
        priceId = STRIPE_PRICES.pointPacks[userPlan].enterprise;
      }

      successUrl = `${baseUrl}/points?success=true&points=${points}&packName=${encodeURIComponent(packName)}`;
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid pack or subscription type' },
        { status: 400 }
      );
    }

    // Create checkout session with actual Price ID
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode,
      success_url: successUrl,
      cancel_url: `${baseUrl}/points?canceled=true`,
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        points: points?.toString() || '0',
        packName: packName || subscriptionType,
        planType: planType || subscriptionType || 'growth'
      }
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to create checkout session',
        details: error
      },
      { status: 500 }
    );
  }
}

// API Route: Create Stripe Checkout Session

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { points, price, packName, planType } = await req.json();

    // Validate inputs
    if (!points || !price || !packName) {
      return NextResponse.json(
        { error: 'Missing required fields: points, price, packName' },
        { status: 400 }
      );
    }

    // Check for Stripe API key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

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
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packName} - ${points.toLocaleString()} Credits`,
              description: `${points.toLocaleString()} credits for your HyveWyre account`,
              images: [`${baseUrl}/logo.png`]
            },
            unit_amount: Math.round(price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${baseUrl}/points?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/points?canceled=true`,
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        points: points.toString(),
        packName,
        planType: planType || 'basic'
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

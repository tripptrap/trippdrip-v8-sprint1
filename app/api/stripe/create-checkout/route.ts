// API Route: Create Stripe Checkout Session

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { points, price, packName } = await req.json();

    // Validate inputs
    if (!points || !price || !packName) {
      return NextResponse.json(
        { error: 'Missing required fields: points, price, packName' },
        { status: 400 }
      );
    }

    // Get Stripe secret key from environment or settings
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

    // Import Stripe dynamically
    const stripe = require('stripe')(stripeSecretKey);

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packName} - ${points.toLocaleString()} Points + SMS Account`,
              description: `${points.toLocaleString()} points + Twilio SMS account setup`
            },
            unit_amount: Math.round(price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/points?success=true&points=${points}&packName=${encodeURIComponent(packName)}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/points?canceled=true`,
      metadata: {
        points: points.toString(),
        packName
      }
    });

    return NextResponse.json({
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

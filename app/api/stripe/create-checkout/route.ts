// API Route: Create Stripe Checkout Session with Demo Mode Support

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEMO_MODE = process.env.STRIPE_DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';

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

    // DEMO MODE: Skip Stripe and directly update credits
    if (DEMO_MODE) {
      console.log('[DEMO MODE] Simulating payment for:', packName, points, 'credits');

      // Update user credits directly in Supabase
      const { data: userData } = await supabase
        .from('users')
        .select('credits, monthly_credits')
        .eq('id', user.id)
        .single();

      const currentCredits = userData?.credits || 0;
      const newCredits = currentCredits + points;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          credits: newCredits,
          monthly_credits: points,
          plan_type: planType || 'basic',
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating credits in demo mode:', updateError);
        return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
      }

      // Create a demo payment record
      await supabase.from('payments').insert({
        user_id: user.id,
        amount: Math.round(price * 100),
        currency: 'usd',
        status: 'demo_completed',
        plan_type: planType || 'basic',
        credits_purchased: points,
        payment_method: 'demo',
        pack_name: packName,
        created_at: new Date().toISOString()
      });

      return NextResponse.json({
        ok: true,
        demo: true,
        message: 'Demo payment completed successfully',
        credits: newCredits,
        points,
        packName
      });
    }

    // REAL MODE: Create Stripe checkout session
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
              description: `${points.toLocaleString()} credits for your HyveWyre account`
            },
            unit_amount: Math.round(price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${baseUrl}/points?success=true&points=${points}&packName=${encodeURIComponent(packName)}`,
      cancel_url: `${baseUrl}/points?canceled=true`,
      client_reference_id: user.id,
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

// API Route: Create Stripe Subscription for Additional Phone Number ($1/month)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

// Price ID for additional phone number ($1/month)
// TODO: Create this product/price in Stripe Dashboard and update this ID
const PHONE_NUMBER_PRICE_ID = process.env.STRIPE_PHONE_NUMBER_PRICE_ID || 'price_phone_number_monthly';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Check for Stripe API key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error: 'Stripe not configured',
          setup: true
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey);

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();

    // Get or create customer
    let customerId: string;

    // Check if user has a Stripe customer ID
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (userData?.stripe_customer_id) {
      customerId = userData.stripe_customer_id;
    } else {
      // Create a new customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;

      // Store customer ID
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Check if user already has an active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length > 0) {
      // Add to existing subscription as a new item
      const subscription = subscriptions.data[0];

      await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: PHONE_NUMBER_PRICE_ID,
        quantity: 1,
        metadata: {
          phone_number: phoneNumber,
          user_id: user.id
        }
      });

      // Order the number from Telnyx
      const apiKey = process.env.TELNYX_API_KEY;
      const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

      if (apiKey) {
        try {
          await fetch('https://api.telnyx.com/v2/number_orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              phone_numbers: [{ phone_number: phoneNumber }],
              messaging_profile_id: messagingProfileId,
              customer_reference: user.id,
            }),
          });
        } catch (telnyxError) {
          console.error('Telnyx order error (non-fatal):', telnyxError);
        }
      }

      // Mark the number as purchased (pending until webhook confirms)
      await supabase
        .from('user_telnyx_numbers')
        .upsert({
          user_id: user.id,
          phone_number: phoneNumber,
          status: 'pending',
          payment_method: 'stripe',
          stripe_subscription_id: subscription.id,
          messaging_profile_id: messagingProfileId || undefined,
        }, {
          onConflict: 'user_id,phone_number'
        });

      return NextResponse.json({
        success: true,
        message: 'Number added to your subscription'
      });
    } else {
      // Create a new checkout session for the number subscription
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: PHONE_NUMBER_PRICE_ID,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: `${baseUrl}/phone-numbers?success=true&number=${encodeURIComponent(phoneNumber)}`,
        cancel_url: `${baseUrl}/phone-numbers?canceled=true`,
        customer: customerId,
        metadata: {
          user_id: user.id,
          phone_number: phoneNumber,
          type: 'additional_number'
        }
      });

      return NextResponse.json({
        ok: true,
        url: session.url
      });
    }

  } catch (error: any) {
    console.error('Create number subscription error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

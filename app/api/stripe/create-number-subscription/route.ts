// API Route: Create Stripe Subscription for Additional Phone Number ($1/month)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isTollFreeNumber, getVerifiedTollFreeNumbers } from '@/lib/telnyx';
import Stripe from 'stripe';

// Admin client to bypass RLS for cross-user ownership checks
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

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
      const subscription = subscriptions.data[0];

      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }

      // Check ownership before charging or ordering anything
      const { data: existingNumber } = await supabaseAdmin
        .from('user_telnyx_numbers')
        .select('id, user_id')
        .eq('phone_number', phoneNumber)
        .single();

      if (existingNumber) {
        const error = existingNumber.user_id === user.id
          ? 'You already own this number'
          : 'This number is already owned by another user';
        return NextResponse.json({ error }, { status: 400 });
      }

      // Block unverified toll-free numbers before charging
      if (isTollFreeNumber(phoneNumber)) {
        const verifiedNumbers = await getVerifiedTollFreeNumbers();
        if (!verifiedNumbers.has(phoneNumber)) {
          return NextResponse.json(
            { error: 'This toll-free number is not verified for messaging. Please choose a verified number from the available pool.' },
            { status: 400 }
          );
        }
      }

      const apiKey = process.env.TELNYX_API_KEY;
      const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

      if (!apiKey) {
        return NextResponse.json({ error: 'Telnyx API key not configured' }, { status: 500 });
      }

      // Order the number from Telnyx FIRST — do not charge the customer
      // until we've confirmed Telnyx actually accepted the order.
      const orderResponse = await fetch('https://api.telnyx.com/v2/number_orders', {
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

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        console.error('Telnyx order error:', JSON.stringify(orderData, null, 2));
        return NextResponse.json(
          { error: orderData.errors?.[0]?.detail || 'Failed to order phone number' },
          { status: orderResponse.status }
        );
      }

      // Telnyx confirmed the order — now it's safe to charge.
      await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: PHONE_NUMBER_PRICE_ID,
        quantity: 1,
        metadata: {
          phone_number: phoneNumber,
          user_id: user.id
        }
      });

      // Mark the number as purchased (pending until webhook confirms provisioning)
      await supabaseAdmin
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
        orderId: orderData.data?.id,
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

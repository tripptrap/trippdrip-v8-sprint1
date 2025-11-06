// API Route: Stripe Webhook Handler with Supabase Integration

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Create Supabase admin client for webhook (bypasses RLS)
// Only create if keys are available
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 400 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;

        // Extract metadata
        const userId = session.client_reference_id || session.metadata?.user_id;
        const points = parseInt(session.metadata?.points || '0');
        const packName = session.metadata?.packName || 'Unknown';
        const planType = session.metadata?.planType || 'basic';

        console.log('Payment successful!', {
          userId,
          points,
          packName,
          planType,
          customerId: session.customer,
          paymentIntent: session.payment_intent
        });

        if (userId && points > 0) {
          if (!supabaseAdmin) {
            console.error('Supabase admin client not configured. Missing SUPABASE_SERVICE_ROLE_KEY.');
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
          }

          // Get current user credits
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('credits, monthly_credits')
            .eq('id', userId)
            .single();

          const currentCredits = userData?.credits || 0;
          const newCredits = currentCredits + points;

          // Update user credits in Supabase
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
              credits: newCredits,
              monthly_credits: points,
              plan_type: planType,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating user credits:', updateError);
          } else {
            console.log(`Updated user ${userId} credits to ${newCredits}`);
          }

          // Create payment record
          await supabaseAdmin.from('payments').insert({
            user_id: userId,
            amount: session.amount_total,
            currency: session.currency,
            status: 'completed',
            plan_type: planType,
            credits_purchased: points,
            payment_method: 'card',
            pack_name: packName,
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent,
            created_at: new Date().toISOString()
          });
        }

        break;

      case 'payment_intent.succeeded':
        console.log('PaymentIntent succeeded:', event.data.object.id);
        break;

      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object;
        console.log('PaymentIntent failed:', failedIntent.id);

        // Record failed payment
        if (failedIntent.metadata?.user_id && supabaseAdmin) {
          await supabaseAdmin.from('payments').insert({
            user_id: failedIntent.metadata.user_id,
            amount: failedIntent.amount,
            currency: failedIntent.currency,
            status: 'failed',
            payment_method: 'card',
            stripe_payment_intent: failedIntent.id,
            created_at: new Date().toISOString()
          });
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

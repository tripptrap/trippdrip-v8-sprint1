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

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

    if (!stripeSecretKey || !webhookSecret) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 400 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);

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
        const sessionId = session.id;

        console.log('Payment successful!', {
          userId,
          sessionId,
          mode: session.mode,
          points,
          packName,
          planType,
          customerId: session.customer,
          subscriptionId: session.subscription,
          paymentIntent: session.payment_intent
        });

        if (!supabaseAdmin) {
          console.error('Supabase admin client not configured. Missing SUPABASE_SERVICE_ROLE_KEY.');
          return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        if (!userId) {
          console.error('No user ID found in session metadata');
          return NextResponse.json({ error: 'No user ID' }, { status: 400 });
        }

        // Check if this is a subscription or one-time payment
        if (session.mode === 'subscription') {
          // Handle subscription creation
          const monthlyCredits = planType === 'premium' ? 10000 : 3000;

          // Check if user row exists
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

          if (!existingUser) {
            // Create new user row
            const { error: insertError } = await supabaseAdmin
              .from('users')
              .insert({
                id: userId,
                email: session.customer_email,
                subscription_tier: planType,
                monthly_credits: monthlyCredits,
                credits: monthlyCredits,
                account_status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (insertError) {
              console.error('Error creating user:', insertError);
            } else {
              console.log(`Created user ${userId} with ${planType} subscription and ${monthlyCredits} credits`);
            }
          } else {
            // Update existing user
            const { error: updateError } = await supabaseAdmin
              .from('users')
              .update({
                subscription_tier: planType,
                monthly_credits: monthlyCredits,
                credits: monthlyCredits,
                account_status: 'active',
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (updateError) {
              console.error('Error updating user subscription:', updateError);
            } else {
              console.log(`Updated user ${userId} to ${planType} subscription with ${monthlyCredits} credits`);
            }
          }

          // Create points transaction record
          await supabaseAdmin.from('points_transactions').insert({
            user_id: userId,
            points_amount: monthlyCredits,
            action_type: 'subscription',
            description: `${planType === 'premium' ? 'Premium' : 'Basic'} subscription - monthly credits`,
            created_at: new Date().toISOString()
          });

        } else if (points > 0) {
          // Handle one-time point pack purchase
          console.log(`💰 Processing point pack purchase: ${points} points for user ${userId}, session ${sessionId}`);

          // CRITICAL: Create transaction record FIRST (with unique constraint)
          // This prevents race conditions where both webhooks update credits
          const { data: insertData, error: insertError } = await supabaseAdmin.from('points_transactions').insert({
            user_id: userId,
            points_amount: points,
            action_type: 'purchase',
            description: `${packName} purchased`,
            stripe_session_id: sessionId,
            created_at: new Date().toISOString()
          });

          if (insertError) {
            // Duplicate key error means another webhook already processed this
            console.error(`⚠️ Transaction insert failed for session ${sessionId}:`, insertError);
            return NextResponse.json({ received: true, duplicate: true });
          }

          console.log(`✅ Transaction record created successfully for session ${sessionId}`);


          // Only update credits if transaction was successfully created
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('credits, monthly_credits')
            .eq('id', userId)
            .single();

          const currentCredits = userData?.credits || 0;
          const newCredits = currentCredits + points;

          // Update user credits
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
              credits: newCredits,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating user credits:', updateError);
          } else {
            console.log(`✅ Updated user ${userId} credits from ${currentCredits} to ${newCredits}`);
          }
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

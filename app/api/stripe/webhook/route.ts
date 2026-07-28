// API Route: Stripe Webhook Handler with Supabase Integration

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Must match the fallbacks in app/api/stripe/create-checkout/route.ts —
// these env vars aren't set in every environment, so both places need
// the same fallback or price-based tier detection breaks silently.
const STRIPE_PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || 'price_1SQtYHFyk0lZUopFNa0lT81K';
const STRIPE_PRICE_SCALE = process.env.STRIPE_PRICE_SCALE || 'price_1SQtaUFyk0lZUopFRJnuLftL';

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
        const planType = session.metadata?.planType || 'growth';
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
          const monthlyCredits = planType === 'scale' ? 10000 : 3000;

          // CRIT-4: Idempotency — insert transaction first with stripe_session_id dedup.
          // If this session was already processed (Stripe retry), bail out immediately.
          const subscriptionAmountCents = session.amount_total || 0;
          const { error: txInsertError } = await supabaseAdmin.from('points_transactions').insert({
            user_id: userId,
            points_amount: monthlyCredits,
            action_type: 'subscription',
            description: `${planType === 'scale' ? 'Scale' : 'Growth'} subscription - monthly credits`,
            stripe_session_id: sessionId,
            amount_paid: subscriptionAmountCents,
            created_at: new Date().toISOString()
          });

          if (txInsertError) {
            console.log(`⚠️ Subscription session ${sessionId} already processed — skipping duplicate webhook`);
            break;
          }

          // Anchor next_renewal_date to the real Stripe billing period rather
          // than a client-side "now + 30 days" guess — current_period_end
          // lives on the subscription item, not the top-level Subscription
          // object, in this account's API version.
          let renewalDates: { last_renewal_date: string; next_renewal_date: string } | null = null;
          if (session.subscription) {
            try {
              const newSub = await stripe.subscriptions.retrieve(session.subscription as string);
              const periodEnd = newSub.items.data[0]?.current_period_end;
              if (periodEnd) {
                renewalDates = {
                  last_renewal_date: new Date().toISOString(),
                  next_renewal_date: new Date(periodEnd * 1000).toISOString(),
                };
              }
            } catch (e: any) {
              console.error('Could not retrieve subscription for renewal date:', e.message);
            }
          }

          // Check if user row exists
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, credits')
            .eq('id', userId)
            .single();

          if (!existingUser) {
            // Create new user row — first subscription, set credits to monthly allotment
            const { error: insertError } = await supabaseAdmin
              .from('users')
              .insert({
                id: userId,
                email: session.customer_email,
                subscription_tier: planType,
                plan_type: planType,
                monthly_credits: monthlyCredits,
                credits: monthlyCredits,
                account_status: 'active',
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription,
                ...renewalDates,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (insertError) {
              console.error('Error creating user:', insertError);
            } else {
              console.log(`Created user ${userId} with ${planType} subscription and ${monthlyCredits} credits`);
            }
          } else {
            // CRIT-4: Additive credits — subscription renewal tops up balance, does not overwrite.
            // Overwriting would destroy any un-used credits or purchased packs the user has.
            const currentCredits = existingUser.credits || 0;
            const { error: updateError } = await supabaseAdmin
              .from('users')
              .update({
                subscription_tier: planType,
                plan_type: planType,
                monthly_credits: monthlyCredits,
                credits: currentCredits + monthlyCredits,
                account_status: 'active',
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription,
                ...renewalDates,
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (updateError) {
              console.error('Error updating user subscription:', updateError);
            } else {
              console.log(`Updated user ${userId} to ${planType}, added ${monthlyCredits} credits (new balance: ${currentCredits + monthlyCredits})`);
            }
          }

        } else if (points > 0) {
          // Handle one-time point pack purchase
          console.log(`💰 Processing point pack purchase: ${points} points for user ${userId}, session ${sessionId}`);

          // CRITICAL: Create transaction record FIRST (with unique constraint)
          // This prevents race conditions where both webhooks update credits
          // Store actual amount paid from Stripe (in cents)
          const packAmountCents = session.amount_total || 0;
          const { data: insertData, error: insertError } = await supabaseAdmin.from('points_transactions').insert({
            user_id: userId,
            points_amount: points,
            action_type: 'purchase',
            description: `${packName} purchased`,
            stripe_session_id: sessionId,
            amount_paid: packAmountCents,
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

      case 'invoice.paid': {
        // The actual monthly renewal grant. checkout.session.completed only
        // fires once, for the first invoice (billing_reason
        // 'subscription_create') — every renewal after that is this event
        // with billing_reason 'subscription_cycle'. Previously there was no
        // server-side renewal handling at all; credits were granted by a
        // client-side check that ran on page load and was disconnected from
        // whether Stripe actually charged the customer that month.
        const invoice = event.data.object as Stripe.Invoice;
        if (!supabaseAdmin) break;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const subId = (invoice as any).parent?.subscription_details?.subscription as string | undefined;
        if (!subId) {
          console.error('invoice.paid: no subscription id on invoice', invoice.id);
          break;
        }

        const { data: renewingUser, error: renewingUserError } = await supabaseAdmin
          .from('users')
          .select('id, credits, subscription_tier')
          .eq('stripe_subscription_id', subId)
          .single();

        if (renewingUserError || !renewingUser) {
          console.error(`invoice.paid: no user found for subscription ${subId}`);
          break;
        }

        const monthlyCredits = renewingUser.subscription_tier === 'scale' ? 10000 : 3000;

        // Idempotency: unique index on stripe_session_id (non-null values
        // only) rejects a duplicate insert if Stripe redelivers this event.
        const { error: renewalTxError } = await supabaseAdmin.from('points_transactions').insert({
          user_id: renewingUser.id,
          points_amount: monthlyCredits,
          action_type: 'subscription',
          description: `${renewingUser.subscription_tier === 'scale' ? 'Scale' : 'Growth'} monthly renewal`,
          stripe_session_id: invoice.id,
          amount_paid: invoice.amount_paid,
          created_at: new Date().toISOString(),
        });

        if (renewalTxError) {
          console.log(`⚠️ Invoice ${invoice.id} already processed — skipping duplicate renewal`);
          break;
        }

        const periodEnd = invoice.lines.data[0]?.period?.end;
        const { error: renewalUpdateError } = await supabaseAdmin
          .from('users')
          .update({
            credits: (renewingUser.credits || 0) + monthlyCredits,
            last_renewal_date: new Date().toISOString(),
            next_renewal_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewingUser.id);

        if (renewalUpdateError) {
          console.error('Error applying renewal credits:', renewalUpdateError);
        } else {
          console.log(`Renewed user ${renewingUser.id}: +${monthlyCredits} credits`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        // Keeps Supabase in sync when the subscription changes anywhere
        // outside the app's own change-plan route — the Stripe Customer
        // Portal, a pause/resume, or a manual change in the Stripe dashboard.
        const subscription = event.data.object as Stripe.Subscription;
        if (!supabaseAdmin) break;

        const priceId = subscription.items.data[0]?.price?.id;
        const tierFromPrice = priceId === STRIPE_PRICE_SCALE
          ? 'scale'
          : priceId === STRIPE_PRICE_GROWTH
          ? 'growth'
          : null;

        const statusUpdate: Record<string, any> = {
          subscription_status: subscription.pause_collection ? 'paused' : subscription.status,
          pause_resumes_at: subscription.pause_collection?.resumes_at
            ? new Date(subscription.pause_collection.resumes_at * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        };
        if (tierFromPrice) {
          statusUpdate.subscription_tier = tierFromPrice;
          statusUpdate.plan_type = tierFromPrice;
          statusUpdate.monthly_credits = tierFromPrice === 'scale' ? 10000 : 3000;
        }

        const { error: subUpdateError } = await supabaseAdmin
          .from('users')
          .update(statusUpdate)
          .eq('stripe_subscription_id', subscription.id);

        if (subUpdateError) {
          console.error('Error syncing subscription update:', subUpdateError);
        } else {
          console.log(`Synced subscription ${subscription.id}: status=${statusUpdate.subscription_status}${tierFromPrice ? `, tier=${tierFromPrice}` : ''}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const canceledSub = event.data.object as Stripe.Subscription;
        if (!supabaseAdmin) break;

        const { error: cancelError } = await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', canceledSub.id);

        if (cancelError) {
          console.error('Error recording subscription cancellation:', cancelError);
        } else {
          console.log(`Recorded cancellation for subscription ${canceledSub.id}`);
        }
        break;
      }

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

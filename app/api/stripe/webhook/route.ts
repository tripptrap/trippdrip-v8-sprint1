// API Route: Stripe Webhook Handler with Supabase Integration

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { isTollFreeNumber, getVerifiedTollFreeNumbers } from '@/lib/telnyx';
import { notifyAdmins } from '@/lib/createNotification';

// Must match the fallbacks in app/api/stripe/create-checkout/route.ts —
// these env vars aren't set in every environment, so both places need
// the same fallback or price-based tier detection breaks silently.
const STRIPE_PRICE_GROWTH = process.env.STRIPE_PRICE_GROWTH || 'price_1SQtYHFyk0lZUopFNa0lT81K';
const STRIPE_PRICE_SCALE = process.env.STRIPE_PRICE_SCALE || 'price_1SQtaUFyk0lZUopFRJnuLftL';

/**
 * Postgres unique-violation. Both purchase paths below use a duplicate
 * points_transactions insert as their idempotency check, so this code means
 * "Stripe redelivered an event we already handled" — routine, not a failure.
 * Any OTHER error on those inserts means the row genuinely didn't write, and
 * both paths then skip granting credits, so the customer paid and got nothing.
 * That distinction decides whether we alert (#80).
 */
const PG_UNIQUE_VIOLATION = '23505';

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
        const phoneNumberPurchase = session.metadata?.phone_number;
        const sessionId = session.id;

        console.log('Payment successful!', {
          userId,
          sessionId,
          mode: session.mode,
          points,
          packName,
          planType,
          phoneNumberPurchase,
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

        // Additional-number checkout (create-number-subscription's checkout-session
        // branch, used when the user has no existing active subscription). This also
        // uses mode: 'subscription', so it MUST be handled before the mode check
        // below or it gets mistaken for a plan purchase and wrongly grants plan credits.
        if (phoneNumberPurchase) {
          // Idempotency: webhook retries/duplicate deliveries must not re-order
          // the number from Telnyx.
          const { data: existingNumber } = await supabaseAdmin
            .from('user_telnyx_numbers')
            .select('id, user_id')
            .eq('phone_number', phoneNumberPurchase)
            .maybeSingle();

          if (existingNumber) {
            if (existingNumber.user_id === userId) {
              console.log(`⚠️ Number ${phoneNumberPurchase} already recorded for user ${userId} — skipping duplicate webhook for session ${sessionId}`);
            } else {
              console.error(`❌ User ${userId} paid for number ${phoneNumberPurchase} (session ${sessionId}) but it is already owned by a different user (${existingNumber.user_id}). Needs manual review/refund.`);
              await notifyAdmins(
                'fulfillment_failed',
                'Paid number is already owned by another user',
                `${phoneNumberPurchase} was paid for but belongs to a different account. Refund or assign a replacement.`,
                { reason: 'already_owned', phone_number: phoneNumberPurchase, user_id: userId, owned_by: existingNumber.user_id, session_id: sessionId }
              );
            }
            break;
          }

          if (isTollFreeNumber(phoneNumberPurchase)) {
            const verifiedNumbers = await getVerifiedTollFreeNumbers();
            if (!verifiedNumbers.has(phoneNumberPurchase)) {
              console.error(`❌ User ${userId} paid for unverified toll-free number ${phoneNumberPurchase} (session ${sessionId}) — order blocked. Needs manual refund or a verified replacement number.`);
              await notifyAdmins(
                'fulfillment_failed',
                'Paid toll-free number is not verified — order blocked',
                `${phoneNumberPurchase} was paid for but is not TFV-verified, so it was not ordered. Refund or supply a verified replacement.`,
                { reason: 'tollfree_unverified', phone_number: phoneNumberPurchase, user_id: userId, session_id: sessionId }
              );
              break;
            }
          }

          const apiKey = process.env.TELNYX_API_KEY;
          const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

          if (!apiKey) {
            console.error(`❌ TELNYX_API_KEY not configured — cannot fulfill paid number ${phoneNumberPurchase} for user ${userId} (session ${sessionId})`);
            await notifyAdmins(
              'fulfillment_failed',
              'Paid number could not be ordered — TELNYX_API_KEY missing',
              `${phoneNumberPurchase} was paid for but TELNYX_API_KEY is not configured, so nothing was ordered.`,
              { reason: 'telnyx_key_missing', phone_number: phoneNumberPurchase, user_id: userId, session_id: sessionId }
            );
            break;
          }

          const orderResponse = await fetch('https://api.telnyx.com/v2/number_orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              phone_numbers: [{ phone_number: phoneNumberPurchase }],
              messaging_profile_id: messagingProfileId,
              customer_reference: userId,
            }),
          });

          const orderData = await orderResponse.json();

          if (!orderResponse.ok) {
            console.error(`❌ Telnyx order failed for paid number ${phoneNumberPurchase} (user ${userId}, session ${sessionId}):`, JSON.stringify(orderData, null, 2));
            await notifyAdmins(
              'fulfillment_failed',
              'Paid number was rejected by Telnyx',
              `${phoneNumberPurchase} was paid for but Telnyx rejected the order. Refund or order a replacement manually.`,
              {
                reason: 'telnyx_order_rejected',
                phone_number: phoneNumberPurchase,
                user_id: userId,
                session_id: sessionId,
                telnyx_error: orderData?.errors?.[0]?.detail || orderData?.errors?.[0]?.title || null,
              }
            );
            break;
          }

          const { error: numberInsertError } = await supabaseAdmin
            .from('user_telnyx_numbers')
            .upsert({
              user_id: userId,
              phone_number: phoneNumberPurchase,
              status: 'pending',
              payment_method: 'stripe',
              stripe_subscription_id: session.subscription,
              messaging_profile_id: messagingProfileId || undefined,
              capabilities: { voice: true, sms: true, mms: true },
            }, {
              onConflict: 'phone_number'
            });

          if (numberInsertError) {
            console.error(`❌ Telnyx order ${orderData.data?.id} succeeded but saving ${phoneNumberPurchase} to user_telnyx_numbers failed for user ${userId}:`, numberInsertError);
            // The worst of the five: the number is ordered and billing on
            // Telnyx, the customer paid, and nothing links the two. Unlike the
            // others this leaves a real orphaned number, so it needs a manual
            // row rather than just a refund.
            await notifyAdmins(
              'fulfillment_failed',
              'URGENT: number ordered and charged but not saved',
              `${phoneNumberPurchase} was ordered from Telnyx (order ${orderData.data?.id}) and the customer was charged, but the user_telnyx_numbers write failed. The number is live and billing with no owner recorded — add the row manually.`,
              {
                reason: 'ordered_but_not_saved',
                phone_number: phoneNumberPurchase,
                user_id: userId,
                session_id: sessionId,
                telnyx_order_id: orderData.data?.id ?? null,
                db_error: numberInsertError.message,
              }
            ,
              // Delay compounds this one: escalate by email, don't wait for a login (#79).
              { escalate: true }
            );
          } else {
            console.log(`✅ Ordered and saved number ${phoneNumberPurchase} for user ${userId} (order ${orderData.data?.id}, session ${sessionId})`);
          }

          break;
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
              await notifyAdmins(
                'fulfillment_failed',
                'URGENT: plan paid for but the user row was not created',
                `A ${planType} subscription was paid for (session ${sessionId}) but creating the user record failed, so the customer has no account and no credits.`,
                { reason: 'user_create_failed', user_id: userId, plan: planType, session_id: sessionId, db_error: insertError.message }
              ,
                // Delay compounds this one: escalate by email, don't wait for a login (#79).
                { escalate: true }
              );
            } else {
              console.log(`Created user ${userId} with ${planType} subscription and ${monthlyCredits} credits`);
            }
          } else {
            // CRIT-4: Additive credits — subscription renewal tops up balance, does not overwrite.
            // Overwriting would destroy any un-used credits or purchased packs the user has.
            const currentCredits = existingUser.credits || 0;
            // Credits are granted separately via add_credits (#92) — including
            // them here would be a read-then-add, silently restoring anything
            // spent between the read above and this write.
            const { error: updateError } = await supabaseAdmin
              .from('users')
              .update({
                subscription_tier: planType,
                plan_type: planType,
                monthly_credits: monthlyCredits,
                account_status: 'active',
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription,
                ...renewalDates,
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (updateError) {
              console.error('Error updating user subscription:', updateError);
              await notifyAdmins(
                'fulfillment_failed',
                'URGENT: plan paid for but the tier and credits were not applied',
                `${userId} paid for ${planType} (session ${sessionId}) but the user update failed — they are on the old tier with no monthly credits added.`,
                { reason: 'subscription_update_failed', user_id: userId, plan: planType, monthly_credits: monthlyCredits, session_id: sessionId, db_error: updateError.message }
              ,
                // Delay compounds this one: escalate by email, don't wait for a login (#79).
                { escalate: true }
              );
            } else {
              const { data: newBalance, error: grantError } = await supabaseAdmin
                .rpc('add_credits', { user_id: userId, amount: monthlyCredits });

              if (grantError) {
                console.error(`❌ Plan applied for ${userId} but ${monthlyCredits} credits NOT granted:`, grantError);
                await notifyAdmins(
                  'fulfillment_failed',
                  'URGENT: plan activated but monthly credits not granted',
                  `${userId} paid for ${planType} (session ${sessionId}) and the tier was applied, but the ${monthlyCredits}-credit grant failed. Add them manually.`,
                  { reason: 'plan_credit_grant_failed', user_id: userId, plan: planType, monthly_credits: monthlyCredits, session_id: sessionId, db_error: grantError.message }
                ,
                  // Delay compounds this one: escalate by email, don't wait for a login (#79).
                  { escalate: true }
                );
              } else {
                console.log(`Updated user ${userId} to ${planType}, added ${monthlyCredits} credits (new balance: ${newBalance})`);
              }
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
            if (insertError.code === PG_UNIQUE_VIOLATION) {
              // Routine: Stripe redelivered an event we already granted.
              console.log(`⚠️ Session ${sessionId} already processed — skipping duplicate point-pack grant`);
              return NextResponse.json({ received: true, duplicate: true });
            }
            // Not a duplicate: the row genuinely failed to write, and the credit
            // grant below is skipped as a result. The customer paid for points
            // they will never receive, and nothing else records it (#80).
            console.error(`❌ Transaction insert failed for session ${sessionId}:`, insertError);
            await notifyAdmins(
              'fulfillment_failed',
              'URGENT: point pack paid for but no credits granted',
              `${userId} paid for ${packName} (${points} points, session ${sessionId}) but the transaction insert failed, so the credit grant was skipped entirely.`,
              { reason: 'pack_transaction_insert_failed', user_id: userId, pack: packName, points, session_id: sessionId, db_error: insertError.message, db_code: insertError.code }
            ,
              // Delay compounds this one: escalate by email, don't wait for a login (#79).
              { escalate: true }
            );
            return NextResponse.json({ received: true, error: 'transaction insert failed' });
          }

          console.log(`✅ Transaction record created successfully for session ${sessionId}`);


          // Only update credits if transaction was successfully created
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('credits, monthly_credits')
            .eq('id', userId)
            .single();

          const currentCredits = userData?.credits || 0;

          // add_credits rather than writing currentCredits + points (#92): the
          // balance may have moved since the read above, and a pack purchase is
          // exactly when someone is likely to be sending.
          const { data: newCredits, error: updateError } = await supabaseAdmin
            .rpc('add_credits', { user_id: userId, amount: points });

          if (updateError) {
            console.error('Error updating user credits:', updateError);
            // Worse than the case above: the transaction row DID write, so the
            // audit trail claims these points were granted when the balance
            // never moved.
            await notifyAdmins(
              'fulfillment_failed',
              'URGENT: point pack charged and logged but credits not added',
              `${userId} paid for ${packName} (${points} points, session ${sessionId}). The transaction row was written but the balance update failed, so the ledger and the balance disagree — add ${points} manually.`,
              { reason: 'pack_credit_update_failed', user_id: userId, pack: packName, points, expected_balance: newCredits, session_id: sessionId, db_error: updateError.message }
            ,
              // Delay compounds this one: escalate by email, don't wait for a login (#79).
              { escalate: true }
            );
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
          await notifyAdmins(
            'fulfillment_failed',
            'Renewal charged but no matching account',
            `Stripe charged a renewal for subscription ${subId} (invoice ${invoice.id}) but no user has that stripe_subscription_id, so no credits were applied to anyone.`,
            { reason: 'renewal_user_not_found', stripe_subscription_id: subId, invoice_id: invoice.id, amount_paid: invoice.amount_paid }
          ,
            // Delay compounds this one: escalate by email, don't wait for a login (#79).
            { escalate: true }
          );
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
          if (renewalTxError.code === PG_UNIQUE_VIOLATION) {
            console.log(`⚠️ Invoice ${invoice.id} already processed — skipping duplicate renewal`);
            break;
          }
          // Not a duplicate. This `break` skips the credit top-up below, so the
          // customer was charged for the month and receives nothing (#80).
          console.error(`❌ Renewal transaction insert failed for invoice ${invoice.id}:`, renewalTxError);
          await notifyAdmins(
            'fulfillment_failed',
            'URGENT: renewal charged but no monthly credits granted',
            `${renewingUser.id} was charged their monthly renewal (invoice ${invoice.id}) but the transaction insert failed, so the ${monthlyCredits} credit top-up was skipped.`,
            { reason: 'renewal_transaction_insert_failed', user_id: renewingUser.id, monthly_credits: monthlyCredits, invoice_id: invoice.id, db_error: renewalTxError.message, db_code: renewalTxError.code }
          ,
            // Delay compounds this one: escalate by email, don't wait for a login (#79).
            { escalate: true }
          );
          break;
        }

        const periodEnd = invoice.lines.data[0]?.period?.end;
        await supabaseAdmin
          .from('users')
          .update({
            last_renewal_date: new Date().toISOString(),
            next_renewal_date: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewingUser.id);

        // Credits via add_credits (#92). A renewal lands on active accounts, so
        // read-then-add here was the most likely of the three to lose a spend.
        const { error: renewalUpdateError } = await supabaseAdmin
          .rpc('add_credits', { user_id: renewingUser.id, amount: monthlyCredits });

        if (renewalUpdateError) {
          console.error('Error applying renewal credits:', renewalUpdateError);
          await notifyAdmins(
            'fulfillment_failed',
            'URGENT: renewal charged and logged but credits not added',
            `${renewingUser.id} was charged their monthly renewal (invoice ${invoice.id}). The transaction row was written but the balance update failed, so the ledger and the balance disagree — add ${monthlyCredits} manually.`,
            { reason: 'renewal_credit_update_failed', user_id: renewingUser.id, monthly_credits: monthlyCredits, invoice_id: invoice.id, db_error: renewalUpdateError.message }
          ,
            // Delay compounds this one: escalate by email, don't wait for a login (#79).
            { escalate: true }
          );
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

// Cron Job: Auto-Buy Credits
// Automatically purchases credits when user balance falls below threshold
// Should be called by a cron job (e.g., Vercel Cron) every hour

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { packForPointsAmount, priceFor } from '@/lib/pointPacks';
import { notifyAdmins, createNotification } from '@/lib/createNotification';
import { alertAdminsThrottled } from '@/lib/alerting';
import { requireCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Timing-safe comparison to prevent timing attacks

// Pack resolution and pricing both live in lib/pointPacks.ts (#76, #39).
//
// This route used to carry its own pack table — 500/1K/2.5K/5K/10K at
// $5/$10/$23.75/$45/$85 — where only the 10K size resembled a real product, and
// even that was $10 under. Combined with a hardcoded flat 30% Scale discount
// (real discounts are per-pack, 10-25%), a Scale user auto-refilling 10,000
// points would have been charged $59.50 against a catalog price of $80.
//
// Do not reintroduce either constant here. The discount IS the difference
// between the two prices in the catalog.

export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronAuth(req);
    if (denied) return denied;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }

    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey);

    // Find users with auto-buy enabled who need refill
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, credits, subscription_tier, stripe_customer_id, auto_topup, auto_topup_threshold, auto_topup_amount')
      .eq('auto_topup', true)
      .not('stripe_customer_id', 'is', null);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const results: Array<{
      userId: string;
      email: string;
      status: 'success' | 'skipped' | 'error';
      message: string;
      pointsAdded?: number;
    }> = [];

    for (const user of users || []) {
      const currentCredits = user.credits || 0;
      const threshold = user.auto_topup_threshold || 100;
      // 500 is the legacy default still stored on every row; it isn't a pack
      // size, so packForPointsAmount rounds it up to the smallest real pack.
      const amount = user.auto_topup_amount || 4000;

      // Skip if above threshold
      if (currentCredits >= threshold) {
        results.push({
          userId: user.id,
          email: user.email,
          status: 'skipped',
          message: `Balance ${currentCredits} is above threshold ${threshold}`
        });
        continue;
      }

      const pack = packForPointsAmount(amount);

      // Scale pays the Scale price, Growth pays the Growth price — both come
      // from lib/pointPacks.ts, the same figures /points charges. Do NOT
      // reintroduce a discount percentage here; the discount is the difference
      // between the two prices, and a separate constant is what made this route
      // charge $59.50 for an $80 pack (#76, #39).
      const isScale = user.subscription_tier === 'scale';
      const tier = isScale ? 'scale' : 'growth';
      const finalPrice = Math.round(priceFor(pack, tier) * 100); // cents

      try {
        // Charge the customer's default payment method
        const paymentIntent = await stripe.paymentIntents.create({
          amount: finalPrice,
          currency: 'usd',
          customer: user.stripe_customer_id,
          off_session: true,
          confirm: true,
          description: `${pack.name} pack - Auto-refill (${tier})`,
          metadata: {
            user_id: user.id,
            points: pack.points.toString(),
            auto_buy: 'true',
            pack: pack.name,
            tier,
          }
        });

        if (paymentIntent.status === 'succeeded') {
          // add_credits (#92). Re-reading immediately before the write narrowed
          // the race but didn't close it — and this runs right after charging a
          // card, so losing the grant means the customer paid for nothing.
          const { error: updateError } = await supabase
            .rpc('add_credits', { user_id: user.id, amount: pack.points });

          if (updateError) {
            // The card is already charged. Throwing here sent this into the
            // Stripe catch below, which reported it as "Payment failed" — the
            // opposite of what happened — and left the customer paying for
            // credits they never received (#80).
            console.error(`❌ Auto-buy charged user ${user.id} $${(finalPrice / 100).toFixed(2)} but the credit grant failed:`, updateError);
            await notifyAdmins(
              'fulfillment_failed',
              'URGENT: auto-refill charged a card but granted no credits',
              `${user.email} was charged $${(finalPrice / 100).toFixed(2)} for the ${pack.name} pack (${pack.points} credits) by auto-refill, and the credit grant failed. The money is taken and nothing was delivered — grant ${pack.points} manually or refund the PaymentIntent.`,
              { reason: 'autobuy_credit_grant_failed', user_id: user.id, email: user.email, pack: pack.name, points: pack.points, amount_cents: finalPrice, payment_intent: paymentIntent.id, db_error: updateError.message }
            ,
              // Delay compounds this one: escalate by email, don't wait for a login (#79).
              { escalate: true }
            );
            results.push({
              userId: user.id,
              email: user.email,
              status: 'error',
              message: `Charged $${(finalPrice / 100).toFixed(2)} but credits were NOT granted — support notified`,
            });
            continue;
          }

          // Log transaction. The column is stripe_session_id (#55) — it already
          // stores checkout session ids and invoice ids, so it's the generic
          // "Stripe object this transaction came from". Using it also picks up
          // the partial unique index on that column, so a repeated auto-buy for
          // the same PaymentIntent can't double-grant.
          const { error: txError } = await supabase.from('points_transactions').insert({
            user_id: user.id,
            action_type: 'purchase',
            points_amount: pack.points,
            description: `Auto-buy: ${pack.name} pack (${tier} pricing)`,
            stripe_session_id: paymentIntent.id,
            amount_paid: finalPrice,
          });

          if (txError) {
            // Credits were already granted and the card already charged, so
            // this can't be rolled back here — but it must not stay silent:
            // without this row there's no audit trail linking the charge to the
            // grant, and /api/user/plan-value under-reports.
            console.error(`❌ Auto-buy charged and credited user ${user.id} but failed to log the transaction:`, txError);
            await notifyAdmins(
              'fulfillment_failed',
              'Auto-refill charged and credited but the ledger row failed',
              `${user.email} was charged $${(finalPrice / 100).toFixed(2)} and received ${pack.points} credits, but no points_transactions row was written — the balance and the ledger now disagree.`,
              { reason: 'autobuy_ledger_failed', user_id: user.id, email: user.email, points: pack.points, amount_cents: finalPrice, payment_intent: paymentIntent.id, db_error: txError.message }
            );
          }

          results.push({
            userId: user.id,
            email: user.email,
            status: 'success',
            message: `Charged $${(finalPrice / 100).toFixed(2)} for ${pack.points} credits`,
            pointsAdded: pack.points
          });
        } else {
          // The PaymentIntent didn't complete — typically requires_action, which
          // an off_session charge can't satisfy. No money was taken, but the
          // refill silently didn't happen and only the customer can fix it (#80).
          console.log(`⚠️ Auto-refill for ${user.id} ended in status ${paymentIntent.status} — no charge, no credits`);
          await createNotification(
            user.id,
            'low_credits',
            "Auto-refill didn't go through",
            `We couldn't complete the automatic purchase of your ${pack.name} pack — your card may need confirming. You have not been charged. Update your payment method in Settings, or buy a point pack directly.`,
            { reason: 'autobuy_payment_incomplete', payment_status: paymentIntent.status, pack: pack.name, amount_cents: finalPrice }
          );
          results.push({
            userId: user.id,
            email: user.email,
            status: 'error',
            message: `Payment status: ${paymentIntent.status}`
          });
        }
      } catch (stripeError: any) {
        console.error(`Auto-buy failed for ${user.email}:`, stripeError);

        // If payment fails, disable auto-buy to prevent repeated failures.
        if (stripeError.code === 'card_declined' || stripeError.code === 'expired_card') {
          const { error: disableError } = await supabase
            .from('users')
            .update({ auto_topup: false })
            .eq('id', user.id);

          if (disableError) {
            // Still enabled, so the cron will retry the declined card hourly.
            console.error(`❌ Auto-buy could not disable auto_topup for ${user.id} after a decline — it will keep retrying:`, disableError);
            await notifyAdmins(
              'fulfillment_failed',
              'Auto-refill kept retrying a declined card',
              `${user.email}'s card was ${stripeError.code} and auto-refill could not be switched off, so the cron will retry it every hour. Disable auto_topup manually.`,
              { reason: 'autobuy_disable_failed', user_id: user.id, email: user.email, stripe_code: stripeError.code, db_error: disableError.message }
            );
          } else {
            // #80: this used to happen silently. A customer's auto-refill
            // switched itself off and nothing told them — they simply stopped
            // topping up and, at zero, stopped being able to send. Only they can
            // fix the card, so they have to be told.
            console.log(`⚠️ Auto-refill disabled for ${user.id} after ${stripeError.code}`);
            await createNotification(
              user.id,
              'low_credits',
              'Auto-refill turned off — your card was declined',
              `We couldn't charge your card for the ${pack.name} pack, so auto-refill has been switched off. Update your payment method in Settings and turn it back on, or buy a point pack directly. Until then your balance won't top up automatically.`,
              { reason: 'autobuy_card_declined', stripe_code: stripeError.code, pack: pack.name, amount_cents: finalPrice }
            );
          }
        }

        results.push({
          userId: user.id,
          email: user.email,
          status: 'error',
          message: stripeError.message || 'Payment failed'
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      ok: true,
      processed: results.length,
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
      results
    });
  } catch (error: any) {
    console.error('Auto-buy cron error:', error);
    await alertAdminsThrottled({
      key: 'cron_run_failed:auto-buy',
      title: 'Auto-refill cron is failing',
      body: `The auto-refill cron threw and charged nobody: ${error.message}. Customers relying on auto-refill will hit zero credits and stop being able to send.`,
      data: { route: 'cron/auto-buy', error: error.message },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

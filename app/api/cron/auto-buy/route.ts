// Cron Job: Auto-Buy Credits
// Automatically purchases credits when user balance falls below threshold
// Should be called by a cron job (e.g., Vercel Cron) every hour

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';
import { packForPointsAmount, priceFor } from '@/lib/pointPacks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Timing-safe comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // HIGH-1: Pad to equal length before comparison — prevents secret-length leakage via timing.
    // Both evaluations always run; length mismatch is caught by a separate boolean check.
    const maxLen = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    const lengthsMatch = bufA.length === bufB.length;
    const bytesMatch = crypto.timingSafeEqual(paddedA, paddedB);
    return lengthsMatch && bytesMatch;
  } catch {
    return false;
  }
}

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
    // Verify cron secret for security (MANDATORY)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('❌ CRON_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const providedSecret = authHeader.replace('Bearer ', '');
    if (!secureCompare(providedSecret, cronSecret)) {
      console.error('❌ Invalid or missing cron secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          // Add credits to user (additive, not overwrite — use read-then-add since auto-buy
          // is a sequential cron, not a concurrent endpoint, so race risk is low here)
          const { data: freshCredits } = await supabase.from('users').select('credits').eq('id', user.id).single();
          const { error: updateError } = await supabase
            .from('users')
            .update({ credits: (freshCredits?.credits ?? currentCredits) + pack.points })
            .eq('id', user.id);

          if (updateError) {
            throw new Error(`Failed to update credits: ${updateError.message}`);
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
          }

          results.push({
            userId: user.id,
            email: user.email,
            status: 'success',
            message: `Charged $${(finalPrice / 100).toFixed(2)} for ${pack.points} credits`,
            pointsAdded: pack.points
          });
        } else {
          results.push({
            userId: user.id,
            email: user.email,
            status: 'error',
            message: `Payment status: ${paymentIntent.status}`
          });
        }
      } catch (stripeError: any) {
        console.error(`Auto-buy failed for ${user.email}:`, stripeError);

        // If payment fails, disable auto-buy to prevent repeated failures
        if (stripeError.code === 'card_declined' || stripeError.code === 'expired_card') {
          await supabase
            .from('users')
            .update({ auto_topup: false })
            .eq('id', user.id);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Cron Job: Auto-Buy Credits
// Automatically purchases credits when user balance falls below threshold
// Should be called by a cron job (e.g., Vercel Cron) every hour

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Point pack definitions with prices
const POINT_PACKS = {
  500: { price: 5, name: 'Auto-Refill 500' },
  1000: { price: 10, name: 'Auto-Refill 1K' },
  2500: { price: 23.75, name: 'Auto-Refill 2.5K' },
  5000: { price: 45, name: 'Auto-Refill 5K' },
  10000: { price: 85, name: 'Auto-Refill 10K' }
};

// Find the closest pack to the requested amount
function findClosestPack(amount: number): { points: number; price: number; name: string } {
  const packSizes = Object.keys(POINT_PACKS).map(Number).sort((a, b) => a - b);

  // Find the smallest pack that's >= the requested amount, or the largest if none match
  let selectedSize = packSizes[packSizes.length - 1];
  for (const size of packSizes) {
    if (size >= amount) {
      selectedSize = size;
      break;
    }
  }

  const pack = POINT_PACKS[selectedSize as keyof typeof POINT_PACKS];
  return { points: selectedSize, ...pack };
}

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
      const amount = user.auto_topup_amount || 500;

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

      // Find appropriate pack
      const pack = findClosestPack(amount);

      // Apply scale discount (30%)
      const isScale = user.subscription_tier === 'scale';
      const discount = isScale ? 0.30 : 0.10; // 30% for scale, 10% for growth
      const finalPrice = Math.round(pack.price * (1 - discount) * 100); // Convert to cents

      try {
        // Charge the customer's default payment method
        const paymentIntent = await stripe.paymentIntents.create({
          amount: finalPrice,
          currency: 'usd',
          customer: user.stripe_customer_id,
          off_session: true,
          confirm: true,
          description: `${pack.name} - Auto-refill (${isScale ? '30%' : '10%'} discount)`,
          metadata: {
            user_id: user.id,
            points: pack.points.toString(),
            auto_buy: 'true',
            discount_applied: discount.toString()
          }
        });

        if (paymentIntent.status === 'succeeded') {
          // Add credits to user
          const { error: updateError } = await supabase
            .from('users')
            .update({ credits: currentCredits + pack.points })
            .eq('id', user.id);

          if (updateError) {
            throw new Error(`Failed to update credits: ${updateError.message}`);
          }

          // Log transaction
          await supabase.from('points_transactions').insert({
            user_id: user.id,
            action_type: 'purchase',
            points_amount: pack.points,
            description: `Auto-buy: ${pack.name} (${isScale ? 'Scale' : 'Growth'} discount)`,
            stripe_payment_intent: paymentIntent.id
          });

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

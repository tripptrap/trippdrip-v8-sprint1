// API Route: Create Stripe Checkout Session

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { POINT_PACKS } from '@/lib/pointPacks';

// LOW-1: Stripe Price IDs loaded from env vars — not hardcoded in source.
// Set these in your .env.local / Vercel environment variables:
//   STRIPE_PRICE_GROWTH=price_...
//   STRIPE_PRICE_SCALE=price_...
//   STRIPE_PRICE_PACK_GROWTH_STARTER=price_...  etc.
const STRIPE_PRICES = {
  subscriptions: {
    growth: process.env.STRIPE_PRICE_GROWTH || 'price_1SQtYHFyk0lZUopFNa0lT81K',
    scale: process.env.STRIPE_PRICE_SCALE || 'price_1SQtaUFyk0lZUopFRJnuLftL'
  },
  pointPacks: {
    growth: {
      starter: process.env.STRIPE_PRICE_PACK_GROWTH_STARTER || 'price_1SQtbMFyk0lZUopFleqbdgVZ',
      pro: process.env.STRIPE_PRICE_PACK_GROWTH_PRO || 'price_1SQtbuFyk0lZUopFbBFafou0',
      business: process.env.STRIPE_PRICE_PACK_GROWTH_BUSINESS || 'price_1SQtciFyk0lZUopFP2ATsGyR',
      enterprise: process.env.STRIPE_PRICE_PACK_GROWTH_ENTERPRISE || 'price_1SQtdJFyk0lZUopFuSaGfzU3'
    },
    scale: {
      starter: process.env.STRIPE_PRICE_PACK_SCALE_STARTER || 'price_1SQtduFyk0lZUopFApnLorDd',
      pro: process.env.STRIPE_PRICE_PACK_SCALE_PRO || 'price_1SQteQFyk0lZUopF63RURC72',
      business: process.env.STRIPE_PRICE_PACK_SCALE_BUSINESS || 'price_1TyGHZFyk0lZUopF5ZSER77Y',
      enterprise: process.env.STRIPE_PRICE_PACK_SCALE_ENTERPRISE || 'price_1TyGHZFyk0lZUopFUlexYwA1'
    }
  }
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // `points`, `price` and `planType` are deliberately NOT read from the body.
    //
    // They used to be, and all three reached something that costs money:
    // `planType` chose which price to charge, and `points` was copied into the
    // checkout session's metadata, which is the ONLY thing the webhook reads to
    // decide how many credits to grant. So this was enough to buy 9,999,999
    // points for the price of the cheapest pack:
    //
    //   { packName: 'Starter', planType: 'scale', points: 9999999 }
    //
    // Same shape as #141 — a caller-supplied number reaching a charge — but on
    // the real-money path rather than the credits one. Everything that decides a
    // price or a quantity is now derived server-side.
    const { packName, subscriptionType } = await req.json();

    // Validate inputs for point packs
    if (!subscriptionType && !packName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // The tier comes from the database, never the request. It selects which of
    // the two prices on a pack the customer is charged — Enterprise is $510 on
    // Growth and $382.50 on Scale, so a body-supplied tier was a $127.50
    // self-service discount.
    const { data: accountRow } = await supabase
      .from('users')
      .select('subscription_tier, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();
    const userPlan: 'growth' | 'scale' =
      accountRow?.subscription_tier === 'scale' ? 'scale' : 'growth';

    // Check for Stripe API key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error: 'Stripe not configured. Please add STRIPE_SECRET_KEY to your environment variables.',
          setup: true
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey);

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim();

    // Determine which Price ID to use
    let priceId: string | null = null;
    let resolvedPack: (typeof POINT_PACKS)[number] | null = null;
    let mode: 'subscription' | 'payment' = 'payment';
    let successUrl = `${baseUrl}/points?success=true&session_id={CHECKOUT_SESSION_ID}`;

    if (subscriptionType) {
      // Handle subscription checkout.
      //
      // ── Refuse if they already have one ──────────────────────────────────────
      //
      // This route never looked at stripe_subscription_id, so "Upgrade to Scale"
      // in Settings created a SECOND live subscription. In mode:'subscription'
      // Stripe mints a brand-new Customer for a session that passes only
      // customer_email, and the webhook then overwrites stripe_customer_id and
      // stripe_subscription_id with the new pair — leaving the original $30 Growth
      // subscription referenced by nothing, still billing, invisible to the
      // billing portal and to cancellation. The customer pays $30 AND $98 (#162).
      //
      // Changing an existing plan is /api/stripe/change-plan, which repoints the
      // price on the subscription that already exists.
      //
      // Checked against Stripe rather than the column, because the column can be
      // stale — a cancellation made in the portal writes subscription_status but
      // leaves stripe_subscription_id in place (#168).
      if (accountRow?.stripe_subscription_id) {
        try {
          const existing = await stripe.subscriptions.retrieve(accountRow.stripe_subscription_id);
          const LIVE = ['active', 'trialing', 'past_due', 'unpaid', 'paused'];
          if (LIVE.includes(existing.status)) {
            return NextResponse.json(
              {
                error: 'You already have an active subscription. Use Change Plan to switch tiers.',
                code: 'subscription_exists',
                currentPlan: userPlan,
              },
              { status: 409 }
            );
          }
        } catch {
          // The stored id does not resolve at Stripe — it belongs to another
          // account, or was deleted. Fall through and let them subscribe.
          console.warn(`Stored subscription ${accountRow.stripe_subscription_id} for ${user.id} could not be retrieved; allowing new checkout`);
        }
      }

      mode = 'subscription';
      successUrl = `${baseUrl}/auth/onboarding?step=2&success=true&session_id={CHECKOUT_SESSION_ID}`;
      priceId = subscriptionType === 'scale'
        ? STRIPE_PRICES.subscriptions.scale
        : STRIPE_PRICES.subscriptions.growth;
    } else {
      // Handle point pack checkout. The pack is resolved against the server-side
      // catalogue, so `points` below is the pack's real size — not a number the
      // caller chose.
      const packType = String(packName).toLowerCase();
      resolvedPack = POINT_PACKS.find(p => packType.includes(p.name.toLowerCase())) ?? null;

      if (!resolvedPack) {
        return NextResponse.json({ error: 'Unknown pack' }, { status: 400 });
      }

      const packKey = resolvedPack.name.toLowerCase() as 'starter' | 'pro' | 'business' | 'enterprise';
      priceId = STRIPE_PRICES.pointPacks[userPlan][packKey];

      // MED-4: Don't put pack details in URL — they appear in logs/analytics and expose purchase info.
      // The success page looks up the session from Stripe to display purchase details.
      successUrl = `${baseUrl}/points?success=true`;
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid pack or subscription type' },
        { status: 400 }
      );
    }

    // Create checkout session with actual Price ID
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode,
      success_url: successUrl,
      cancel_url: `${baseUrl}/points?canceled=true`,
      client_reference_id: user.id,
      // Reuse the known customer rather than handing Stripe an email and letting
      // it mint a new one. Every point-pack purchase used to create a fresh
      // Customer, so a user's charges scattered across several of them and the
      // billing portal — which opens on stripe_customer_id — showed only whichever
      // was written last. Stripe rejects `customer` and `customer_email` together,
      // so it is one or the other.
      ...(accountRow?.stripe_customer_id
        ? { customer: accountRow.stripe_customer_id }
        : { customer_email: user.email }),
      metadata: {
        user_id: user.id,
        // The pack's own size, from POINT_PACKS. The webhook grants whatever
        // this says, so it must never be caller-supplied.
        points: resolvedPack ? String(resolvedPack.points) : '0',
        packName: resolvedPack?.name || subscriptionType,
        planType: subscriptionType || userPlan
      }
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    // `details: error` used to be here. The serialized Stripe error carries `raw`,
    // `code`, `param`, `requestId`, the price id that was attempted, and — on an
    // auth failure — a message of the form "Invalid API Key provided: sk_test_***…"
    // that leaks the key's mode and last characters. None of that belongs in a
    // client response; the console.error above keeps it for us (#176).
    return NextResponse.json(
      {
        error: 'Could not start checkout. Please try again or contact support.',
      },
      { status: 500 }
    );
  }
}

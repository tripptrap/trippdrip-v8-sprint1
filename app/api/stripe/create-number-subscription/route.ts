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

// Price ID for the additional phone number ($1/month).
//
// No placeholder fallback. This used to be
//   process.env.STRIPE_PHONE_NUMBER_PRICE_ID || 'price_phone_number_monthly'
// and that env var has never been set, so every request fell through to a literal
// that exists in no Stripe account. Combined with ordering the number from Telnyx
// BEFORE charging, that made this route give away real numbers on the platform's
// Telnyx account and never bill for a single one (#154).
//
// Undefined now, and the request is refused up front rather than half-completing.
const PHONE_NUMBER_PRICE_ID = process.env.STRIPE_PHONE_NUMBER_PRICE_ID?.trim() || null;

// Release a number we just ordered but could not bill for. Best-effort: the caller
// is already returning an error, so this only decides whether the platform keeps
// paying for a number nobody bought.
async function releaseOrderedNumber(phoneNumber: string, apiKey: string): Promise<void> {
  try {
    const lookup = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!lookup.ok) {
      console.error(`Could not look up ${phoneNumber} to release it: HTTP ${lookup.status}`);
      return;
    }
    const id = (await lookup.json())?.data?.[0]?.id;
    if (!id) {
      console.error(`Could not find ${phoneNumber} at Telnyx to release it — it may still be provisioning`);
      return;
    }
    const del = await fetch(`https://api.telnyx.com/v2/phone_numbers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!del.ok) {
      console.error(`Failed to release ${phoneNumber} (id ${id}) after a billing failure: HTTP ${del.status} — this number is now billing with no owner`);
      return;
    }
    console.log(`Released ${phoneNumber} after billing failed`);
  } catch (e: any) {
    console.error(`Failed to release ${phoneNumber} after a billing failure:`, e?.message || e);
  }
}

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

    // Prove the price exists BEFORE touching Telnyx.
    //
    // This is the whole of #154. The route orders the number from Telnyx first and
    // charges afterwards — a deliberate choice, per the comment further down, so a
    // customer is never billed for a number Telnyx refused. That reasoning is fine
    // right up until the charge can NEVER succeed, at which point the ordering
    // guarantees the opposite failure: real numbers provisioned on the platform's
    // account, every time, billed to nobody.
    //
    // Checking the price here costs one API call and makes the later charge unable
    // to fail for the reason it always failed. Anything else that goes wrong at
    // charge time is compensated by releasing the number.
    if (!PHONE_NUMBER_PRICE_ID) {
      console.error('STRIPE_PHONE_NUMBER_PRICE_ID is not set — refusing to order a number that cannot be billed');
      return NextResponse.json(
        { error: 'Number purchasing is not configured yet. Please contact support.', setup: true },
        { status: 503 }
      );
    }

    try {
      const price = await stripe.prices.retrieve(PHONE_NUMBER_PRICE_ID);
      if (!price.active) {
        console.error(`STRIPE_PHONE_NUMBER_PRICE_ID ${PHONE_NUMBER_PRICE_ID} exists but is archived`);
        return NextResponse.json(
          { error: 'Number purchasing is not configured yet. Please contact support.', setup: true },
          { status: 503 }
        );
      }
    } catch (priceError: any) {
      console.error(`STRIPE_PHONE_NUMBER_PRICE_ID ${PHONE_NUMBER_PRICE_ID} does not exist on this Stripe account:`, priceError?.message || priceError);
      return NextResponse.json(
        { error: 'Number purchasing is not configured yet. Please contact support.', setup: true },
        { status: 503 }
      );
    }

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

      // Store customer ID.
      //
      // SERVICE ROLE, and the error is checked. `authenticated` may UPDATE exactly
      // four columns of public.users and stripe_customer_id is not one of them —
      // verified live (authenticated: false, service_role: true). The result was
      // never destructured, so Postgres refused the write with 42501 and nothing
      // noticed.
      //
      // The consequence compounds rather than just failing: the id never persists,
      // so the next call takes this same branch and creates ANOTHER Stripe customer.
      // Each one can carry its own subscription, and the account ends up with
      // recurring charges attached to customers that no users row references — so
      // the billing portal cannot reach them and cancellation cannot find them (#156).
      if (!supabaseAdmin) {
        console.error('Cannot persist stripe_customer_id — service role client unavailable');
        return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
      }

      const { error: customerIdError } = await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);

      if (customerIdError) {
        // Bail before anything is ordered or charged. A customer now exists in
        // Stripe with no local reference, which is untidy but inert — far better
        // than a live subscription nothing can find.
        console.error('Failed to persist stripe_customer_id:', customerIdError);
        return NextResponse.json(
          { error: 'Could not link your billing account. Please try again or contact support.' },
          { status: 500 }
        );
      }
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

      // Telnyx confirmed the order — now it's safe to charge. The price was proven
      // to exist before we ordered, so a failure here is a real billing problem
      // (card, subscription state, Stripe outage) rather than the guaranteed
      // misconfiguration that made this route give numbers away (#154).
      try {
        await stripe.subscriptionItems.create({
          subscription: subscription.id,
          price: PHONE_NUMBER_PRICE_ID,
          quantity: 1,
          metadata: {
            phone_number: phoneNumber,
            user_id: user.id
          }
        });
      } catch (chargeError: any) {
        // Give the number back. Without this the platform keeps paying Telnyx for
        // a number nobody bought, and the DB has no row to find it by.
        console.error(`Billing failed for ${phoneNumber} after Telnyx accepted the order — releasing it:`, chargeError?.message || chargeError);
        await releaseOrderedNumber(phoneNumber, apiKey);
        return NextResponse.json(
          { error: 'We could not bill your subscription for this number, so it was not added. Please check your payment method and try again.' },
          { status: 402 }
        );
      }

      // Mark the number as purchased (pending until webhook confirms provisioning).
      //
      // The error is checked. It used to be a bare await returning { success: true }
      // regardless, so a failed write left the number ordered and the customer
      // charged with nothing linking the two — the number would be invisible in the
      // UI and unreleasable through the app (#165). The webhook's byte-identical
      // write already escalates on failure; this one at least must not claim success.
      const { error: linkError } = await supabaseAdmin
        .from('user_telnyx_numbers')
        .upsert({
          user_id: user.id,
          phone_number: phoneNumber,
          status: 'pending',
          payment_method: 'stripe',
          stripe_subscription_id: subscription.id,
          messaging_profile_id: messagingProfileId || undefined,
          capabilities: { voice: true, sms: true, mms: true },
        }, {
          onConflict: 'phone_number'
        });

      if (linkError) {
        // Deliberately NOT released here: the customer has been charged and the
        // number is genuinely theirs. Releasing it would destroy something they
        // paid for. Escalate so a human reconciles it instead.
        console.error(`ORPHANED NUMBER — ${phoneNumber} ordered and billed for user ${user.id} but not linked in user_telnyx_numbers:`, linkError);
        return NextResponse.json(
          { error: 'Your number was purchased but could not be linked to your account. Please contact support — quote number ' + phoneNumber + '.' },
          { status: 500 }
        );
      }

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

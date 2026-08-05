// API Route: Purchase a phone number using credits

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkNumberEligibility } from '@/lib/numberEligibility';
import { notifyAdmins } from '@/lib/createNotification';
import { autoAssignNumberToCampaign } from '@/lib/autoAssignCampaignNumber';
import { isTollFreeNumber } from '@/lib/telnyx';
import { numberPriceInCredits } from '@/lib/numberPricing';

// Credit changes run on the service-role client, never the caller's (#114).
//
// add_credits and deduct_credits are SECURITY DEFINER and were granted to
// `authenticated`. Their guard only stops you acting on ANOTHER user — acting on
// your own id was permitted, so any logged-in user could POST
// /rest/v1/rpc/add_credits with their own id and mint credits. Verified: a test
// account went 0 -> 999,999 in one request. Credits are what the point packs
// sell, so that was revenue, not just data.
//
// EXECUTE is revoked from authenticated; these calls run as service_role. The
// user id still comes from the verified session.


export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // `credits` is deliberately NOT read from the body. It used to be, and the
    // charge was `credits || CREDITS_PER_NUMBER` — so a caller posting
    // `{ phoneNumber, credits: 1 }` bought a 100-credit number for 1 credit,
    // and the affordability check above the deduction used the same
    // caller-supplied number, so it passed trivially (#141). The client still
    // sends the field on older builds; ignoring it is what makes this safe.
    const { phoneNumber } = await req.json();

    // Validated before the gate, which now inspects the number to decide which
    // rules apply — passing an undefined number into that check would decide the
    // type from nothing.
    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Same gate as the other two number paths (#1) — a number bought before the
    // business is registered cannot carry A2P traffic, and spending the user's
    // credits on one is worse than refusing.
    //
    // Type-aware, because the gate is the 10DLC one and toll-free is not 10DLC.
    // The body is read first so the type is known before gating; it used to be
    // read after, which is why this check could not tell the two apart.
    const gate = await checkNumberEligibility(createServiceRoleClient(), user.id, {
      numberType: isTollFreeNumber(phoneNumber) ? 'tollfree' : 'local',
    });
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason, code: gate.code, registrationRequired: true },
        { status: 403 }
      );
    }

    // Server-derived, from lib/numberPricing — never from the request.
    const requiredCredits = numberPriceInCredits(phoneNumber);

    // Get user's current credits
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user credits:', userError);
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const currentCredits = userData.credits || 0;

    // Read only to produce a helpful message. The RPC below is the authority —
    // it re-checks the balance inside a single atomic UPDATE, so a concurrent
    // spend between this read and the deduction cannot overdraw the account.
    if (currentCredits < requiredCredits) {
      return NextResponse.json(
        {
          error: `Insufficient credits. You have ${currentCredits} credits but need ${requiredCredits}.`,
          currentCredits,
          requiredCredits
        },
        { status: 400 }
      );
    }

    // #91: was read-then-write (`credits: currentCredits - requiredCredits`),
    // which loses any concurrent change. deduct_credits does it in one
    // statement and refuses rather than going negative.
    const { data: balanceAfterCharge, error: deductError } = await createServiceRoleClient().rpc('deduct_credits', {
      user_id: user.id,
      amount: requiredCredits,
      reason: `Phone number: ${phoneNumber}`,
    });

    if (deductError) {
      console.error('Error deducting credits:', deductError);
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    /**
     * Give the credits back after a failed purchase.
     *
     * Refunds with a DELTA, never by restoring the balance read earlier —
     * a snapshot restore silently discards anything else that changed in the
     * meantime (#91). And the result is checked: a refund that fails must not
     * be reported to the customer as "credits refunded", which is what this
     * route used to do unconditionally.
     */
    const refundCredits = async (reason: string): Promise<boolean> => {
      // `reason` is what add_credits writes into points_transactions. Without
      // it this refund moved the balance and recorded NOTHING (#137), while the
      // matching charge DID write a -N 'spend' row — so a failed purchase left
      // the customer's history claiming they paid for a number they never got.
      const { error: refundError } = await createServiceRoleClient().rpc('add_credits', {
        user_id: user.id,
        amount: requiredCredits,
        reason: `Refund — number purchase failed: ${phoneNumber}`,
      });
      if (refundError) {
        console.error(`❌ ${reason} — and the ${requiredCredits}-credit refund ALSO failed for user ${user.id}:`, refundError);
        await notifyAdmins(
          'fulfillment_failed',
          'URGENT: number purchase failed and the credit refund failed too',
          `${user.id} was charged ${requiredCredits} credits for ${phoneNumber}, the purchase failed (${reason}), and the refund did not go through. The balance must be corrected by hand.`,
          { reason: 'credit_refund_failed', user_id: user.id, phone_number: phoneNumber, credits: requiredCredits, cause: reason, db_error: refundError.message }
        ,
          // Delay compounds this one: escalate by email, don't wait for a login (#79).
          { escalate: true }
        );
        return false;
      }
      return true;
    };

    // Order the number from Telnyx
    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (apiKey) {
      try {
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

        if (!orderResponse.ok) {
          const orderError = await orderResponse.json().catch(() => ({}));
          console.error('Telnyx order error:', orderError);
          const refunded = await refundCredits('Telnyx rejected the number order');
          const detail = orderError.errors?.[0]?.detail || 'Failed to order number from Telnyx.';
          return NextResponse.json(
            {
              error: refunded
                ? `${detail} Your credits have been refunded.`
                : `${detail} We could not automatically refund your ${requiredCredits} credits — support has been notified.`,
              refunded,
            },
            { status: 500 }
          );
        }
      } catch (telnyxError) {
        console.error('Telnyx API call failed:', telnyxError);
        const refunded = await refundCredits('could not reach Telnyx');
        return NextResponse.json(
          {
            error: refunded
              ? 'Failed to reach Telnyx. Your credits have been refunded.'
              : `Failed to reach Telnyx, and we could not automatically refund your ${requiredCredits} credits — support has been notified.`,
            refunded,
          },
          { status: 500 }
        );
      }
    }

    // Service-role for the write. `user_telnyx_numbers` has RLS on with a
    // SELECT policy and **no INSERT policy**, so the request-scoped client
    // cannot write to it at all — this upsert failed every time, after the
    // Telnyx order had already succeeded. Every purchase through this route
    // left a real number live and billing with no owner recorded (#106).
    //
    // Safe: the caller is authenticated above and the row is scoped to
    // `user.id`, never to anything from the request body. The other four write
    // paths (telnyx/purchase-number, number-pool/claim, number-order-webhook,
    // stripe/webhook) already do exactly this; this route was the odd one out.
    const { error: numberError } = await createServiceRoleClient()
      .from('user_telnyx_numbers')
      .upsert({
        user_id: user.id,
        phone_number: phoneNumber,
        status: 'pending',
        payment_method: 'credits',
        credits_charged: requiredCredits,
        messaging_profile_id: messagingProfileId,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        capabilities: { voice: true, sms: true, mms: true },
      }, {
        onConflict: 'phone_number'
      });

    if (!numberError) {
      // Attach it to the user's 10DLC campaign if they have an approved one.
      // A number that is not on the campaign has its A2P traffic filtered by
      // carriers, and this used to require finding a button in Settings (#107).
      await autoAssignNumberToCampaign(user.id, phoneNumber);
    }

    if (numberError) {
      console.error('Error adding number:', numberError);
      const refunded = await refundCredits('the number was ordered but could not be saved');
      // Worse than the other two: if the Telnyx order above succeeded, the
      // number is live and billing on the account with no owner recorded.
      await notifyAdmins(
        'fulfillment_failed',
        'URGENT: number ordered but not saved to the account',
        `${phoneNumber} may be live on Telnyx with no owner row for user ${user.id}. Credits ${refunded ? 'were refunded' : 'were NOT refunded'}. Check Telnyx and add the row or release the number.`,
        { reason: 'number_ordered_not_saved', user_id: user.id, phone_number: phoneNumber, credits: requiredCredits, refunded, db_error: numberError.message }
      ,
        // Delay compounds this one: escalate by email, don't wait for a login (#79).
        { escalate: true }
      );
      return NextResponse.json(
        {
          error: refunded
            ? 'Failed to add number. Your credits have been refunded.'
            : `Failed to add number, and we could not automatically refund your ${requiredCredits} credits — support has been notified.`,
          refunded,
        },
        { status: 500 }
      );
    }

    // Log the transaction. Was fire-and-forget, so a purchase could succeed with
    // no ledger row and nothing to reconcile against.
    const { error: ledgerError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: user.id,
        amount: -requiredCredits,
        type: 'phone_number_purchase',
        description: `Phone number: ${phoneNumber}`,
        metadata: { phone_number: phoneNumber }
      });

    if (ledgerError) {
      // The charge and the number both went through, so this can't be undone —
      // but the balance and the ledger now disagree.
      console.error(`❌ Number ${phoneNumber} purchased for user ${user.id} but the credit_transactions row failed:`, ledgerError);
    }

    console.log(`✅ User ${user.id} purchased number ${phoneNumber} with ${requiredCredits} credits`);

    return NextResponse.json({
      success: true,
      message: `Successfully purchased ${phoneNumber} with ${requiredCredits} credits`,
      newBalance: balanceAfterCharge,
      phone_number: phoneNumber
    });

  } catch (error: any) {
    console.error('Purchase with credits error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

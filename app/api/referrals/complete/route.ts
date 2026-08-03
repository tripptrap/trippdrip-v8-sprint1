import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isInternalCaller } from '@/lib/cronAuth';

// Granting a referral reward is a SYSTEM action, not a user action (#116).
//
// ── What was wrong ──────────────────────────────────────────────────────────
//
// This route authenticated the caller, took `referralId` straight from the body,
// and called `complete_referral` on the **service-role** client — without ever
// checking that the caller had anything to do with that referral. `user.id` was
// read for the auth gate and then never used again. The header comment claimed
// "the tenant still comes from the verified session", which was simply false.
//
// So any logged-in user could complete any referral by id, and completion grants
// `premium_month` — 30 days of premium — to that referral's `referrer_user_id`.
// The obvious exploit is to refer yourself, then complete it, without the
// referred account ever having paid for anything.
//
// This is the confused-deputy half of #114. That issue moved privilege out of
// the caller's client and into routes like this one; it did not add the
// ownership check the RPC had never performed either.
//
// ── Why the fix is not an ownership check ───────────────────────────────────
//
// The instinct is "verify the caller owns the referral". That is the wrong shape
// here: the referrer is precisely the party who benefits, so letting them
// trigger their own reward is the exploit, not the fix. Nobody should be able to
// complete a referral by asking.
//
// A reward is earned when the referred account actually subscribes. So the route
// is internal-only, and the entitlement is re-derived from the referred user's
// subscription rather than trusted from whoever called.
//
// ── Nothing legitimately calls this yet ─────────────────────────────────────
//
// No UI calls it, and the Stripe webhook does not either — so referrals can be
// created by /api/referrals/apply-code and never completed. That gap is real but
// separate; closing the hole first means wiring the trigger later cannot
// reintroduce it.

export async function POST(req: NextRequest) {
  try {
    // Internal callers only. A user session is deliberately NOT accepted: the
    // only party who could want to call this is the one who gets paid for it.
    if (!isInternalCaller(req)) {
      console.error('❌ Rejected referral completion without a valid internal secret');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { referralId } = body;

    if (!referralId) {
      return NextResponse.json({ ok: false, error: 'Referral ID is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();

    // Re-derive the entitlement rather than trusting the request. Even a
    // legitimate internal trigger can fire on the wrong event, and a reward
    // granted in error is real money.
    const { data: referral, error: referralError } = await admin
      .from('referrals')
      .select('id, status, referred_user_id')
      .eq('id', referralId)
      .maybeSingle();

    if (referralError) {
      console.error('Error loading referral:', referralError);
      return NextResponse.json({ ok: false, error: referralError.message }, { status: 500 });
    }
    if (!referral) {
      return NextResponse.json({ ok: false, error: 'Referral not found' }, { status: 404 });
    }
    if (!referral.referred_user_id) {
      return NextResponse.json(
        { ok: false, error: 'Referral has no referred account' },
        { status: 400 }
      );
    }

    const { data: referred, error: referredError } = await admin
      .from('users')
      .select('subscription_tier, account_status')
      .eq('id', referral.referred_user_id)
      .maybeSingle();

    if (referredError) {
      console.error('Error loading referred user:', referredError);
      return NextResponse.json({ ok: false, error: referredError.message }, { status: 500 });
    }

    // 'unpaid' is the state a new account sits in before it subscribes, so the
    // check is for a real paid tier rather than merely "not unpaid" — a tier
    // string nobody anticipated should not earn anyone a month of premium.
    const PAID_TIERS = ['growth', 'scale'];
    const isPaid =
      !!referred &&
      PAID_TIERS.includes(String(referred.subscription_tier)) &&
      referred.account_status !== 'cancelled';

    if (!isPaid) {
      console.log(
        `Referral ${referralId} not completed — referred account is ${referred?.subscription_tier ?? 'missing'}/${referred?.account_status ?? '-'}`
      );
      return NextResponse.json(
        { ok: false, error: 'Referred account has not subscribed' },
        { status: 409 }
      );
    }

    // The RPC still owns idempotency: it refuses a referral whose status is not
    // 'pending', so a repeated trigger cannot grant a second month.
    const { data, error } = await admin.rpc('complete_referral', {
      p_referral_id: referralId,
    });

    if (error) {
      console.error('Error completing referral:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result?.success) {
      return NextResponse.json({ ok: false, error: result?.error }, { status: 400 });
    }

    console.log(`✅ Referral ${referralId} completed — reward ${result.reward_id}`);

    return NextResponse.json({
      ok: true,
      rewardId: result.reward_id,
      expiresAt: result.expires_at,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error in complete route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

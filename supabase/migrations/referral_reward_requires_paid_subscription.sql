-- A referral reward requires the referred account to have actually subscribed (#116).
--
-- `complete_referral` granted `premium_month` — 30 days of premium — to
-- `referrer_user_id` on nothing more than a referral id in 'pending' status. It
-- never checked whether the referred account had paid for anything.
--
-- The route in front of it now checks, and is internal-only. This adds the same
-- check inside the function so it holds regardless of who calls: the natural
-- next step is wiring the Stripe webhook to complete a referral when a
-- subscription activates, and that trigger would call the RPC directly.
--
-- Defence in depth against a real money loss, not theoretical: the original
-- defect let any logged-in user grant themselves a free month by referring
-- themselves and then completing their own referral.
--
-- 'unpaid' is the state a new account sits in before subscribing, so this tests
-- for a real paid tier rather than merely "not unpaid" — an unanticipated tier
-- string should not earn anyone a month of premium.

CREATE OR REPLACE FUNCTION public.complete_referral(p_referral_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_referral RECORD;
  v_referred RECORD;
  v_reward_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_referral
  FROM public.referrals
  WHERE id = p_referral_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Referral not found');
  END IF;

  -- Idempotency. A repeated trigger must not grant a second month.
  IF v_referral.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Referral already processed');
  END IF;

  IF v_referral.referred_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Referral has no referred account');
  END IF;

  -- The entitlement itself.
  SELECT subscription_tier, account_status INTO v_referred
  FROM public.users
  WHERE id = v_referral.referred_user_id;

  IF NOT FOUND
     OR v_referred.subscription_tier NOT IN ('growth', 'scale')
     OR v_referred.account_status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Referred account has not subscribed');
  END IF;

  v_expires_at := now() + interval '30 days';

  INSERT INTO public.referral_rewards (
    user_id, referral_id, reward_type, reward_days, expires_at, is_active
  ) VALUES (
    v_referral.referrer_user_id, p_referral_id, 'premium_month', 30, v_expires_at, true
  )
  RETURNING id INTO v_reward_id;

  UPDATE public.referrals
     SET status = 'rewarded', reward_granted_at = now()
   WHERE id = p_referral_id;

  RETURN json_build_object(
    'success', true,
    'reward_id', v_reward_id,
    'expires_at', v_expires_at,
    'message', 'Referral completed and reward granted'
  );
END;
$function$;

COMMENT ON FUNCTION public.complete_referral(uuid) IS
  'Grants a referral reward, but only when the referred account holds a paid subscription (#116). service_role only.';

REVOKE ALL ON FUNCTION public.complete_referral(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_referral(uuid) TO service_role;

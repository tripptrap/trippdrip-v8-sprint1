// Renewal date read helper. The actual credit grant on renewal is handled
// server-side by the Stripe webhook (invoice.paid, billing_reason
// 'subscription_cycle') in app/api/stripe/webhook/route.ts — it used to be
// a client-side function that ran on every page load and treated a null
// next_renewal_date as "renewal overdue," granting a bonus month of credits
// to every new signup the first time they opened the dashboard, completely
// disconnected from whether Stripe had actually charged them. Removed.
import { createClient } from "@/lib/supabase/client";

// Days until the next renewal, or null when no renewal is scheduled.
//
// `next_renewal_date` is only meaningful when a Stripe subscription exists — the
// webhook rewrites it from the real billing period on each invoice.paid. Without a
// subscription it is a fossil written at signup, and computing a difference
// against it returned a NEGATIVE day count (as low as -238 on this database)
// straight into the UI. Four accounts are in exactly that state: a paid tier with
// no subscription behind it (#185).
//
// Returning null is the honest answer — nothing is going to renew. Callers already
// handle null, since it was the no-date case.
export function renewalDaysFrom(
  nextRenewalDate: string | null | undefined,
  stripeSubscriptionId: string | null | undefined
): number | null {
  if (!nextRenewalDate || !stripeSubscriptionId) return null;

  const diffMs = new Date(nextRenewalDate).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Get days until next renewal
export async function getDaysUntilRenewal(): Promise<number | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userData } = await supabase
    .from('users')
    .select('next_renewal_date, stripe_subscription_id')
    .eq('id', user.id)
    .single();

  return renewalDaysFrom(userData?.next_renewal_date, userData?.stripe_subscription_id);
}

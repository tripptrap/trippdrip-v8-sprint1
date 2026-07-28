// Renewal date read helper. The actual credit grant on renewal is handled
// server-side by the Stripe webhook (invoice.paid, billing_reason
// 'subscription_cycle') in app/api/stripe/webhook/route.ts — it used to be
// a client-side function that ran on every page load and treated a null
// next_renewal_date as "renewal overdue," granting a bonus month of credits
// to every new signup the first time they opened the dashboard, completely
// disconnected from whether Stripe had actually charged them. Removed.
import { createClient } from "@/lib/supabase/client";

// Get days until next renewal
export async function getDaysUntilRenewal(): Promise<number | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userData } = await supabase
    .from('users')
    .select('next_renewal_date')
    .eq('id', user.id)
    .single();

  if (!userData?.next_renewal_date) return null;

  const now = new Date();
  const nextRenewal = new Date(userData.next_renewal_date);
  const diffTime = nextRenewal.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

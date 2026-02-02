// Automatic Monthly Renewal System
import { createClient } from "@/lib/supabase/client";

export async function checkAndRenewCredits(): Promise<{
  renewed: boolean;
  newBalance?: number;
  message?: string;
}> {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { renewed: false, message: 'Not authenticated' };
  }

  // Fetch user data
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('credits, monthly_credits, subscription_tier, next_renewal_date, last_renewal_date')
    .eq('id', user.id)
    .single();

  if (fetchError || !userData) {
    console.error('Error fetching user data:', fetchError);
    return { renewed: false, message: 'Failed to fetch user data' };
  }

  // Check if renewal is due
  const now = new Date();
  const nextRenewalDate = new Date(userData.next_renewal_date);

  if (now < nextRenewalDate) {
    // Not time to renew yet
    return { renewed: false, message: 'Renewal not due yet' };
  }

  // Time to renew!
  const monthlyCredits = userData.monthly_credits || (userData.subscription_tier === 'scale' ? 10000 : 3000);
  const currentCredits = userData.credits || 0;
  const newBalance = currentCredits + monthlyCredits;

  // Calculate next renewal date (30 days from now)
  const newNextRenewalDate = new Date();
  newNextRenewalDate.setDate(newNextRenewalDate.getDate() + 30);

  // Update user's credits and renewal dates
  const { error: updateError } = await supabase
    .from('users')
    .update({
      credits: newBalance,
      last_renewal_date: now.toISOString(),
      next_renewal_date: newNextRenewalDate.toISOString(),
      updated_at: now.toISOString()
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('Error updating renewal:', updateError);
    return { renewed: false, message: 'Failed to update renewal' };
  }

  // Record transaction
  const planName = userData.subscription_tier === 'scale' ? 'Scale Plan' : 'Growth Plan';
  const { error: transactionError } = await supabase
    .from('points_transactions')
    .insert({
      user_id: user.id,
      type: 'earn',
      amount: monthlyCredits,
      description: `Monthly renewal - ${planName} (+${monthlyCredits.toLocaleString()} credits)`,
      created_at: now.toISOString()
    });

  if (transactionError) {
    console.error('Error recording renewal transaction:', transactionError);
  }

  // Dispatch event to update UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointsUpdated', {
      detail: { balance: newBalance }
    }));
  }

  return {
    renewed: true,
    newBalance,
    message: `✨ Monthly renewal! +${monthlyCredits.toLocaleString()} credits added`
  };
}

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

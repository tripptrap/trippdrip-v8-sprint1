// Server-Side Points Management with Supabase
// This file is for use in API routes and server components only

import { createClient as createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendSmsAlertToUser } from '@/lib/sendSmsAlert';

// Fire a low-credits alert once per threshold crossing (avoids spam)
const LOW_CREDITS_THRESHOLD = 50;

export type ActionType = 'sms_sent' | 'ai_response' | 'document_upload' | 'bulk_message' | 'flow_creation';

// Cost configuration for different actions
export const POINT_COSTS: Record<ActionType, number> = {
  sms_sent: 1,              // 1 point per single text message (1-to-1)
  ai_response: 2,           // 2 points per AI response / smart reply
  document_upload: 5,       // 3-8 points for document upload with AI processing (default 5)
  bulk_message: 2,          // 2 points per bulk/mass message (per contact)
  flow_creation: 15         // 15 points for flow creation
};

// Spend points for a specific action (SERVER-SIDE)
export async function spendPointsForAction(
  actionType: ActionType,
  count: number = 1
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const costPerAction = POINT_COSTS[actionType];
  const totalCost = costPerAction * count;

  const actionDescriptions: Record<ActionType, string> = {
    sms_sent: `SMS sent (${count}x)`,
    ai_response: `AI response generated (${count}x)`,
    document_upload: `Document uploaded with AI processing (${count}x)`,
    bulk_message: `Bulk message sent to ${count} contact(s)`,
    flow_creation: `Flow created (${count}x)`
  };

  return await spendPoints(totalCost, actionDescriptions[actionType], actionType);
}

// Spend points (SERVER-SIDE)
export async function spendPoints(
  amount: number,
  description: string,
  actionType?: ActionType
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Balance read only so the low-credits alert below can tell whether this spend
  // is the one that crossed the threshold. It is NOT what authorises the spend —
  // see below.
  const { data: userData } = await supabase
    .from('users')
    .select('credits')
    .eq('id', user.id)
    .single();
  const currentBalance = userData?.credits ?? 0;

  // ── Atomic, because read-then-write loses deductions (audit, 2026-08-03) ────
  //
  // This used to SELECT credits, subtract in JavaScript, and UPDATE the result.
  // Two concurrent spends both read 100, both write 95, and one charge silently
  // vanishes. Not theoretical: a bulk campaign fires many sends at once, which
  // is exactly the shape that loses the most — the busier the account, the more
  // free credits it gets.
  //
  // `deduct_credits` already did this correctly and nothing called it:
  //
  //   UPDATE users SET credits = credits - amount
  //    WHERE id = ? AND credits >= amount RETURNING credits
  //
  // One statement, so the guard and the write cannot be separated by another
  // transaction, and NOT FOUND (no row matched) is the insufficient-funds case.
  //
  // Service-role client because #114/`cd21589` revoked EXECUTE on every
  // SECURITY DEFINER function from anon and authenticated. The user id comes
  // from the verified session above, never from an argument.
  const { data: rpcBalance, error: deductError } = await createServiceRoleClient()
    .rpc('deduct_credits', { user_id: user.id, amount });

  if (deductError) {
    // The function RAISEs check_violation (23514) for both "not enough credits"
    // and "no such user". Both mean the charge did not happen.
    if (deductError.code === '23514' || /insufficient/i.test(deductError.message || '')) {
      return { success: false, error: 'Insufficient points' };
    }
    console.error('Error deducting credits:', deductError);
    return { success: false, error: 'Failed to update balance' };
  }

  const newBalance = typeof rpcBalance === 'number' ? rpcBalance : currentBalance - amount;

  // Record transaction
  const { error: transactionError } = await supabase
    .from('points_transactions')
    .insert({
      user_id: user.id,
      action_type: 'spend',
      points_amount: -amount,
      description,
      created_at: new Date().toISOString()
    });

  if (transactionError) {
    console.error('Error recording transaction:', transactionError);
  }

  // Fire low-credits alert when balance crosses below threshold
  if (currentBalance >= LOW_CREDITS_THRESHOLD && newBalance < LOW_CREDITS_THRESHOLD) {
    sendSmsAlertToUser(user.id, 'low_credits', { currentCredits: newBalance })
      .catch(err => console.error('Low credits alert failed:', err));
  }

  return { success: true, balance: newBalance };
}

// Add points (SERVER-SIDE for purchases)
export async function addPoints(
  amount: number,
  description: string,
  type: 'earn' | 'purchase' = 'purchase'
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get current balance
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (fetchError || !userData) {
    return { success: false, error: 'Failed to fetch user data' };
  }

  const currentBalance = userData.credits || 0;
  const newBalance = currentBalance + amount;

  // Add points
  const { error: updateError } = await supabase
    .from('users')
    .update({ credits: newBalance, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) {
    console.error('Error updating balance:', updateError);
    return { success: false, error: 'Failed to update balance' };
  }

  // Record transaction
  const { error: transactionError } = await supabase
    .from('points_transactions')
    .insert({
      user_id: user.id,
      action_type: type,
      points_amount: amount,
      description,
      created_at: new Date().toISOString()
    });

  if (transactionError) {
    console.error('Error recording transaction:', transactionError);
  }

  return { success: true, balance: newBalance };
}

// Check if user can afford an action (SERVER-SIDE)
export async function canAffordAction(actionType: ActionType, count: number = 1): Promise<boolean> {
  const cost = POINT_COSTS[actionType] * count;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching balance:', error);
    return false;
  }

  const balance = data?.credits || 0;
  return balance >= cost;
}

// Get action cost (PURE FUNCTION - works everywhere)
export function getActionCost(actionType: ActionType, count: number = 1): number {
  return POINT_COSTS[actionType] * count;
}

// Get recent transactions (SERVER-SIDE)
export async function getRecentTransactions(limit: number = 10) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from('points_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }

  return data || [];
}

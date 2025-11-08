// Points Management with Supabase
import { createClient } from "@/lib/supabase/client";

export type ActionType = 'sms_sent' | 'ai_response' | 'document_upload' | 'bulk_message' | 'flow_creation';

// Cost configuration for different actions
export const POINT_COSTS: Record<ActionType, number> = {
  sms_sent: 1,              // 1 point per single text message (1-to-1)
  ai_response: 2,           // 2 points per AI response / smart reply
  document_upload: 5,       // 3-8 points for document upload with AI processing (default 5)
  bulk_message: 2,          // 2 points per bulk/mass message (per contact)
  flow_creation: 15         // 15 points for flow creation
};

// Get user's current balance from Supabase
export async function getPointsBalance(): Promise<number> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return 0;

  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching balance:', error);
    return 0;
  }

  return data?.credits || 0;
}

// Spend points for a specific action
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

// Spend points
export async function spendPoints(
  amount: number,
  description: string,
  actionType?: ActionType
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const supabase = createClient();
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

  if (currentBalance < amount) {
    return { success: false, error: 'Insufficient points' };
  }

  // Deduct points
  const newBalance = currentBalance - amount;
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
      action_type: 'spend',
      points_amount: -amount,
      description,
      created_at: new Date().toISOString()
    });

  if (transactionError) {
    console.error('Error recording transaction:', transactionError);
  }

  // Dispatch event for UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointsUpdated', {
      detail: { balance: newBalance }
    }));
  }

  return { success: true, balance: newBalance };
}

// Add points (for purchases)
export async function addPoints(
  amount: number,
  description: string,
  type: 'earn' | 'purchase' = 'purchase'
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const supabase = createClient();
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

  // Dispatch event for UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointsUpdated', {
      detail: { balance: newBalance }
    }));
  }

  return { success: true, balance: newBalance };
}

// Check if user can afford an action
export async function canAffordAction(actionType: ActionType, count: number = 1): Promise<boolean> {
  const cost = POINT_COSTS[actionType] * count;
  const balance = await getPointsBalance();
  return balance >= cost;
}

// Get action cost
export function getActionCost(actionType: ActionType, count: number = 1): number {
  return POINT_COSTS[actionType] * count;
}

// Get recent transactions
export async function getRecentTransactions(limit: number = 10) {
  const supabase = createClient();
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

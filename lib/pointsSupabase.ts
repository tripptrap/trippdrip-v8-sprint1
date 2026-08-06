// Points Management with Supabase (CLIENT-SIDE)
// For server-side usage (API routes), use pointsSupabaseServer.ts instead

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
// The browser-side WRITERS were removed here (#143): spendPointsForAction(),
// spendPoints() and addPoints().
//
// All three did a read-then-write UPDATE of users.credits straight from the
// browser and then inserted their own points_transactions row. None of it could
// work: column grants let `authenticated` write only business_hours,
// business_name, timezone and updated_at on public.users, and #144 revoked
// INSERT on points_transactions as well. Verified live with an anon-key client —
// both writes are refused.
//
// They were also the wrong shape regardless. addPoints() was a credit-minting
// primitive reachable from a page: /points offered to "simulate" a purchase and
// grant the pack whenever Stripe was unconfigured or the checkout call threw, so
// a payment FAILURE offered free credits. Real purchases have always been granted
// server-side by the Stripe webhook, which writes its ledger row first as an
// idempotency claim and then calls add_credits — 7 purchases totalling 188,000
// points went through it.
//
// Spending server-side goes through lib/pointsSupabaseServer, which derives cost
// from POINT_COSTS and charges via the deduct_credits RPC (#137). Granting goes
// through the Stripe webhook or an admin grant. There is no legitimate reason for
// a browser to move a balance, so this file is read-only now.

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

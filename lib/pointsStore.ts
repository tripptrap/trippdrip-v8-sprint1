// Points Management System - Supabase Version

export type ActionType = 'sms_sent' | 'ai_response' | 'email_sent' | 'ai_chat' | 'flow_generation';

export type PointTransaction = {
  id: string;
  action_type: 'earn' | 'spend' | 'purchase' | 'subscription';
  points_amount: number;
  description: string;
  created_at: string;
  user_id?: string;
  stripe_session_id?: string;
  lead_id?: string;
  message_id?: string;
  campaign_id?: string;
};

import { SubscriptionTier } from './subscriptionFeatures';

export type PlanType = SubscriptionTier;

export type PointsData = {
  balance: number;
  transactions: PointTransaction[];
  lastRenewal: string;
  autoTopUp: boolean;
  autoTopUpThreshold: number;
  autoTopUpAmount: number;
  planType: PlanType;
};

// Cost configuration for different actions
export const POINT_COSTS: Record<ActionType, number> = {
  sms_sent: 1,           // 1 point per SMS sent
  ai_response: 2,        // 2 points per AI-generated response
  email_sent: 0.5,       // 0.5 points per email
  ai_chat: 1,            // 1 point per AI chat message
  flow_generation: 5     // 5 points for generating a flow
};

export async function loadPoints(): Promise<PointsData> {
  if (typeof window === 'undefined') return getDefaultPoints();

  try {
    // This would need a new API endpoint to fetch user data + transactions
    // For now, we'll use a combination of approaches
    const response = await fetch('/api/user/points');
    const data = await response.json();

    if (data.ok) {
      return data.pointsData;
    }

    return getDefaultPoints();
  } catch (error) {
    console.error('Error loading points:', error);
    return getDefaultPoints();
  }
}

// This function is deprecated - points are saved automatically via API calls
export async function savePoints(data: PointsData): Promise<void> {
  // Points are now managed through the database
  // This function is kept for backward compatibility but does nothing
  console.warn('savePoints() is deprecated - points are managed automatically');
}

export function getDefaultPoints(): PointsData {
  return {
    balance: 1000, // Starting balance with Basic plan
    transactions: [],
    lastRenewal: new Date().toISOString(),
    autoTopUp: false,
    autoTopUpThreshold: 100,
    autoTopUpAmount: 500,
    planType: 'growth'
  };
}

// Deprecated - use spendPoints API endpoint instead
export async function addPoints(amount: number, description: string, type: 'earn' | 'purchase' = 'purchase'): Promise<PointsData> {
  console.warn('addPoints() should use API endpoint instead');
  return getDefaultPoints();
}

// Use the API endpoint to spend points
export async function spendPoints(amount: number, description: string, actionType?: ActionType): Promise<{ success: boolean; data?: PointsData; error?: string }> {
  try {
    const response = await fetch('/api/points/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, description })
    });

    const data = await response.json();

    if (data.ok) {
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('pointsUpdated', { 
        detail: { balance: data.balance } 
      }));

      return { success: true, data: { ...getDefaultPoints(), balance: data.balance } };
    }

    return { success: false, error: data.error || 'Failed to spend points' };
  } catch (error: any) {
    console.error('Error spending points:', error);
    return { success: false, error: error.message || 'Failed to spend points' };
  }
}

// Spend points for a specific action
export async function spendPointsForAction(actionType: ActionType, count: number = 1): Promise<{ success: boolean; data?: PointsData; error?: string }> {
  const costPerAction = POINT_COSTS[actionType];
  const totalCost = costPerAction * count;

  const actionDescriptions: Record<ActionType, string> = {
    sms_sent: `SMS sent (${count}x)`,
    ai_response: `AI response generated (${count}x)`,
    email_sent: `Email sent (${count}x)`,
    ai_chat: `AI chat message (${count}x)`,
    flow_generation: `Flow generation (${count}x)`
  };

  return spendPoints(totalCost, actionDescriptions[actionType], actionType);
}

// Check if user has enough points for an action
export async function canAffordAction(actionType: ActionType, count: number = 1): Promise<boolean> {
  const data = await loadPoints();
  const cost = POINT_COSTS[actionType] * count;
  return data.balance >= cost;
}

// Get cost for an action
export function getActionCost(actionType: ActionType, count: number = 1): number {
  return POINT_COSTS[actionType] * count;
}

// Handle auto top-up (placeholder for payment integration)
function handleAutoTopUp(): void {
  console.log('Auto top-up would be triggered here via Stripe');
}

// Enable/disable auto top-up - would need API endpoint
export async function setAutoTopUp(enabled: boolean, threshold?: number, amount?: number): Promise<PointsData> {
  console.warn('setAutoTopUp() needs API endpoint implementation');
  return getDefaultPoints();
}

export async function getPointsBalance(): Promise<number> {
  const data = await loadPoints();
  return data.balance;
}

export async function getRecentTransactions(limit: number = 10): Promise<PointTransaction[]> {
  const data = await loadPoints();
  return data.transactions.slice(0, limit);
}

export async function getUsageStats(days: number = 7): Promise<{
  totalSpent: number;
  totalEarned: number;
  avgDailySpend: number;
  daysRemaining: number;
}> {
  const data = await loadPoints();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const recentTransactions = data.transactions.filter(t =>
    new Date(t.created_at) > cutoff
  );

  const totalSpent = recentTransactions
    .filter(t => t.action_type === 'spend')
    .reduce((sum, t) => sum + Math.abs(t.points_amount), 0);

  const totalEarned = recentTransactions
    .filter(t => t.action_type === 'earn' || t.action_type === 'purchase')
    .reduce((sum, t) => sum + t.points_amount, 0);

  const avgDailySpend = totalSpent / days;
  const daysRemaining = avgDailySpend > 0 ? Math.floor(data.balance / avgDailySpend) : 999;

  return {
    totalSpent,
    totalEarned,
    avgDailySpend,
    daysRemaining
  };
}

export async function needsTopUp(): Promise<boolean> {
  const data = await loadPoints();
  return data.balance <= 200; // Alert threshold
}

export async function checkMonthlyRenewal(): Promise<void> {
  console.warn('checkMonthlyRenewal() should be handled server-side');
}

// Get current plan type
export async function getCurrentPlan(): Promise<PlanType> {
  const data = await loadPoints();
  return data.planType || 'growth';
}

// Switch plan type - would need API endpoint
export async function switchPlan(planType: PlanType): Promise<PointsData> {
  console.warn('switchPlan() needs API endpoint implementation');
  return getDefaultPoints();
}

// Get plan details
export function getPlanDetails(planType: PlanType): { price: number; monthlyPoints: number; name: string } {
  if (planType === 'scale') {
    return {
      price: 98,
      monthlyPoints: 10000,
      name: 'Scale Plan'
    };
  }
  return {
    price: 30,
    monthlyPoints: 3000,
    name: 'Growth Plan'
  };
}

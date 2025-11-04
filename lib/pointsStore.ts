// Points Management System

export type ActionType = 'sms_sent' | 'ai_response' | 'email_sent' | 'ai_chat' | 'flow_generation';

export type PointTransaction = {
  id: string;
  type: 'earn' | 'spend' | 'purchase';
  amount: number;
  description: string;
  timestamp: string;
  actionType?: ActionType; // Track what action caused this transaction
};

export type PlanType = 'basic' | 'premium';

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

const STORAGE_KEY = 'userPoints';

export function loadPoints(): PointsData {
  if (typeof window === 'undefined') return getDefaultPoints();

  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    const defaultData = getDefaultPoints();
    savePoints(defaultData);
    return defaultData;
  }

  return JSON.parse(data);
}

export function savePoints(data: PointsData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  // Trigger custom event for real-time updates
  window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: data }));
}

export function getDefaultPoints(): PointsData {
  return {
    balance: 1000, // Starting balance with Basic plan
    transactions: [
      {
        id: Date.now().toString(),
        type: 'earn',
        amount: 1000,
        description: 'Monthly renewal - Basic plan',
        timestamp: new Date().toISOString()
      }
    ],
    lastRenewal: new Date().toISOString(),
    autoTopUp: false,
    autoTopUpThreshold: 100,
    autoTopUpAmount: 500,
    planType: 'basic'
  };
}

export function addPoints(amount: number, description: string, type: 'earn' | 'purchase' = 'purchase'): PointsData {
  const data = loadPoints();

  data.balance += amount;
  data.transactions.unshift({
    id: Date.now().toString(),
    type,
    amount,
    description,
    timestamp: new Date().toISOString()
  });

  savePoints(data);
  return data;
}

export function spendPoints(amount: number, description: string, actionType?: ActionType): { success: boolean; data?: PointsData; error?: string } {
  const data = loadPoints();

  if (data.balance < amount) {
    return { success: false, error: 'Insufficient points' };
  }

  data.balance -= amount;
  data.transactions.unshift({
    id: Date.now().toString(),
    type: 'spend',
    amount: -amount,
    description,
    timestamp: new Date().toISOString(),
    actionType
  });

  savePoints(data);

  // Check if auto top-up is needed
  if (data.autoTopUp && data.balance <= data.autoTopUpThreshold) {
    handleAutoTopUp();
  }

  return { success: true, data };
}

// Spend points for a specific action
export function spendPointsForAction(actionType: ActionType, count: number = 1): { success: boolean; data?: PointsData; error?: string } {
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
export function canAffordAction(actionType: ActionType, count: number = 1): boolean {
  const data = loadPoints();
  const cost = POINT_COSTS[actionType] * count;
  return data.balance >= cost;
}

// Get cost for an action
export function getActionCost(actionType: ActionType, count: number = 1): number {
  return POINT_COSTS[actionType] * count;
}

// Handle auto top-up (placeholder for payment integration)
function handleAutoTopUp(): void {
  const data = loadPoints();

  // In production, this would trigger a payment via Stripe
  // For now, we'll just log and add points (you'll replace this with Stripe)
  console.log('Auto top-up triggered! Balance:', data.balance);

  // TODO: Integrate with Stripe to charge card
  // For now, simulate auto top-up
  addPoints(data.autoTopUpAmount, `Auto top-up - ${data.autoTopUpAmount} points`, 'purchase');
}

// Enable/disable auto top-up
export function setAutoTopUp(enabled: boolean, threshold?: number, amount?: number): PointsData {
  const data = loadPoints();

  data.autoTopUp = enabled;
  if (threshold !== undefined) data.autoTopUpThreshold = threshold;
  if (amount !== undefined) data.autoTopUpAmount = amount;

  savePoints(data);
  return data;
}

export function getPointsBalance(): number {
  const data = loadPoints();
  return data.balance;
}

export function getRecentTransactions(limit: number = 10): PointTransaction[] {
  const data = loadPoints();
  return data.transactions.slice(0, limit);
}

export function getUsageStats(days: number = 7): {
  totalSpent: number;
  totalEarned: number;
  avgDailySpend: number;
  daysRemaining: number;
} {
  const data = loadPoints();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const recentTransactions = data.transactions.filter(t =>
    new Date(t.timestamp) > cutoff
  );

  const totalSpent = recentTransactions
    .filter(t => t.type === 'spend')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalEarned = recentTransactions
    .filter(t => t.type === 'earn' || t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  const avgDailySpend = totalSpent / days;
  const daysRemaining = avgDailySpend > 0 ? Math.floor(data.balance / avgDailySpend) : 999;

  return {
    totalSpent,
    totalEarned,
    avgDailySpend,
    daysRemaining
  };
}

export function needsTopUp(): boolean {
  const data = loadPoints();
  return data.balance <= 200; // Alert threshold
}

export function checkMonthlyRenewal(): void {
  const data = loadPoints();
  const lastRenewal = new Date(data.lastRenewal);
  const now = new Date();

  // Check if a month has passed
  const monthsSince = (now.getFullYear() - lastRenewal.getFullYear()) * 12 +
                      (now.getMonth() - lastRenewal.getMonth());

  if (monthsSince >= 1) {
    const renewalAmount = data.planType === 'premium' ? 15000 : 1000;
    const planName = data.planType === 'premium' ? 'Premium plan ($98.99)' : 'Basic plan ($30)';
    addPoints(renewalAmount, `Monthly renewal - ${planName}`, 'earn');
    data.lastRenewal = now.toISOString();
    savePoints(data);
  }
}

// Get current plan type
export function getCurrentPlan(): PlanType {
  const data = loadPoints();
  return data.planType || 'basic';
}

// Switch plan type
export function switchPlan(planType: PlanType): PointsData {
  const data = loadPoints();
  const oldPlan = data.planType;
  data.planType = planType;

  // Add a transaction noting the plan change
  const planName = planType === 'premium' ? 'Premium ($98.99/mo)' : 'Basic ($30/mo)';
  data.transactions.unshift({
    id: Date.now().toString(),
    type: 'earn',
    amount: 0,
    description: `Switched to ${planName}`,
    timestamp: new Date().toISOString()
  });

  savePoints(data);
  return data;
}

// Get plan details
export function getPlanDetails(planType: PlanType): { price: number; monthlyPoints: number; name: string } {
  if (planType === 'premium') {
    return {
      price: 98.99,
      monthlyPoints: 15000,
      name: 'Premium Plan'
    };
  }
  return {
    price: 30,
    monthlyPoints: 1000,
    name: 'Basic Plan'
  };
}

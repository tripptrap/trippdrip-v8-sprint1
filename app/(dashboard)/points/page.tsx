"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { addPoints as addPointsSupabase, getRecentTransactions as getRecentTransactionsSupabase } from "@/lib/pointsSupabase";
import { type PointTransaction, type PlanType } from "@/lib/pointsStore";
import { getDaysUntilRenewal } from "@/lib/renewalSystem";
import { SUBSCRIPTION_FEATURES, type SubscriptionTier } from "@/lib/subscriptionFeatures";
import CustomModal from "@/components/CustomModal";

type PointPack = {
  name: string;
  points: number;
  basePrice: number;
  premiumPrice: number;
  baseDiscount?: string;
  premiumDiscount?: string;
  popular?: boolean;
};

const POINT_PACKS: PointPack[] = [
  {
    name: "Starter",
    points: 4000,
    basePrice: 40,
    premiumPrice: 36,
    premiumDiscount: "10% off",
  },
  {
    name: "Pro",
    points: 10000,
    basePrice: 95,
    premiumPrice: 80,
    baseDiscount: "5% off",
    premiumDiscount: "20% off",
    popular: true,
  },
  {
    name: "Business",
    points: 25000,
    basePrice: 225,
    premiumPrice: 187.5,
    baseDiscount: "10% off",
    premiumDiscount: "25% off",
  },
  {
    name: "Enterprise",
    points: 60000,
    basePrice: 510,
    premiumPrice: 420,
    baseDiscount: "15% off",
    premiumDiscount: "30% off",
  },
];

// Helper function to get plan details
function getPlanDetails(planType: PlanType): { price: number; monthlyPoints: number; name: string } {
  if (planType === 'premium') {
    return {
      price: 98.99,
      monthlyPoints: 10000,
      name: 'Premium Plan'
    };
  }
  return {
    price: 30,
    monthlyPoints: 3000,
    name: 'Basic Plan'
  };
}

export default function PointsPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [currentPlan, setCurrentPlan] = useState<PlanType>('basic');
  const [showCelebration, setShowCelebration] = useState(false);
  const [daysUntilRenewal, setDaysUntilRenewal] = useState<number | null>(null);
  const [stats, setStats] = useState({
    totalSpent: 0,
    totalEarned: 0,
    avgDailySpend: 0,
    daysRemaining: 999
  });
  const [modal, setModal] = useState<{isOpen: boolean, type: 'success'|'error'|'warning'|'info'|'confirm', title: string, message: string, onConfirm?: () => void}>({isOpen: false, type: 'info', title: '', message: ''});

  useEffect(() => {
    refreshData();

    // Handle Stripe success/cancel redirects
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const points = urlParams.get('points');
    const packName = urlParams.get('packName');

    if (success === 'true' && points) {
      // Points are added by the webhook, just show confirmation
      setModal({isOpen: true, type: 'success', title: 'Payment Successful', message: `Payment successful! ${parseInt(points).toLocaleString()} points will be added to your account shortly.`});
      window.history.replaceState({}, '', '/points');
      refreshData(); // Refresh to show updated balance
    } else if (canceled === 'true') {
      setModal({isOpen: true, type: 'warning', title: 'Payment Canceled', message: 'Payment canceled. No charges were made.'});
      window.history.replaceState({}, '', '/points');
    }

    const handleUpdate = () => refreshData();
    window.addEventListener('pointsUpdated', handleUpdate);
    return () => window.removeEventListener('pointsUpdated', handleUpdate);
  }, []);

  async function handlePurchaseComplete(points: number, packName: string) {
    try {
      // Add points to Supabase
      const result = await addPointsSupabase(points, `${packName} purchased`, 'purchase');

      if (result.success) {
        setModal({isOpen: true, type: 'success', title: 'Payment Successful', message: `Payment successful! ${points.toLocaleString()} points added to your account.`});
        await refreshData();
      } else {
        setModal({isOpen: true, type: 'error', title: 'Error Adding Points', message: `Error adding points: ${result.error}`});
      }
    } catch (error) {
      console.error('Error completing purchase:', error);
      setModal({isOpen: true, type: 'error', title: 'Purchase Error', message: 'Error completing purchase. Please contact support.'});
    }

    // Clean URL
    window.history.replaceState({}, '', '/points');
  }

  async function refreshData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Check days until renewal
    const days = await getDaysUntilRenewal();
    setDaysUntilRenewal(days);

    // Fetch user data from Supabase
    const { data: userData, error } = await supabase
      .from('users')
      .select('credits, subscription_tier, monthly_credits')
      .eq('id', user.id)
      .single();

    if (!error && userData) {
      setBalance(userData.credits || 0);
      setCurrentPlan((userData.subscription_tier as PlanType) || 'basic');
    }

    // Fetch transactions from Supabase
    const txns = await getRecentTransactionsSupabase(20);
    setTransactions(txns as PointTransaction[]);

    // Calculate stats from transactions
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const recentTxns = txns.filter((t: any) => new Date(t.created_at) > cutoff);
    const totalSpent = recentTxns
      .filter((t: any) => t.type === 'spend')
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    const totalEarned = recentTxns
      .filter((t: any) => t.type === 'earn' || t.type === 'purchase')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const avgDailySpend = totalSpent / 7;
    const daysRemaining = avgDailySpend > 0 ? Math.floor((userData?.credits || 0) / avgDailySpend) : 999;

    setStats({
      totalSpent,
      totalEarned,
      avgDailySpend,
      daysRemaining
    });
  }

  async function handlePlanSwitch(planType: PlanType) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setModal({isOpen: true, type: 'error', title: 'Authentication Required', message: 'Not authenticated'});
      return;
    }

    const oldPlan = currentPlan;

    // Confirm downgrade if going from premium to basic
    if (oldPlan === 'premium' && planType === 'basic') {
      setModal({
        isOpen: true,
        type: 'confirm',
        title: 'Confirm Downgrade',
        message: 'Are you sure you want to downgrade to Basic plan? You will lose Premium discounts on point packs and monthly credits will drop from 10,000 to 3,000. Your existing point balance will be preserved.',
        onConfirm: async () => {
          await performPlanSwitch(planType, oldPlan, supabase, user.id);
        }
      });
      return;
    }

    await performPlanSwitch(planType, oldPlan, supabase, user.id);
  }

  async function performPlanSwitch(planType: PlanType, oldPlan: PlanType, supabase: any, userId: string) {
    // Update subscription tier in Supabase
    const newMonthlyCredits = planType === 'premium' ? 10000 : 3000;

    // Only reset credits if upgrading - preserve existing balance when downgrading
    const updateData: any = {
      subscription_tier: planType,
      monthly_credits: newMonthlyCredits
    };

    // If upgrading to premium, grant the new monthly credits immediately
    if (planType === 'premium' && oldPlan === 'basic') {
      updateData.credits = newMonthlyCredits;
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      setModal({isOpen: true, type: 'error', title: 'Plan Switch Failed', message: `Failed to switch plan: ${error.message}`});
      return;
    }

    // Dispatch custom event for components listening to plan changes
    window.dispatchEvent(new CustomEvent('planTypeChanged', {
      detail: { planType: planType === 'premium' ? 'premium' : 'basic' }
    }));

    // Refresh data
    await refreshData();

    // Show celebration if upgrading to premium
    if (planType === 'premium' && oldPlan === 'basic') {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
    }

    setModal({isOpen: true, type: 'success', title: 'Plan Changed', message: `Successfully switched to ${planType === 'premium' ? 'Premium' : 'Basic'} plan!`});
  }

  async function handlePurchase(pack: PointPack) {
    const price = currentPlan === 'premium' ? pack.premiumPrice : pack.basePrice;
    console.log('Purchase initiated:', {
      currentPlan,
      pack: pack.name,
      basePrice: pack.basePrice,
      premiumPrice: pack.premiumPrice,
      selectedPrice: price
    });

    try {
      // Try to create Stripe checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: pack.points,
          price: price,
          packName: pack.name,
          planType: currentPlan
        })
      });

      const result = await response.json();

      if (result.setup) {
        // Stripe not configured - fallback to simulated purchase
        setModal({
          isOpen: true,
          type: 'confirm',
          title: 'Stripe Not Configured',
          message: `Stripe not configured yet. Simulate purchase of ${pack.points.toLocaleString()} points for $${price}?`,
          onConfirm: async () => {
            const addResult = await addPointsSupabase(pack.points, `${pack.name} purchased ($${price}) - SIMULATED`, 'purchase');
            if (addResult.success) {
              setModal({isOpen: true, type: 'success', title: 'Purchase Simulated', message: `Successfully added ${pack.points.toLocaleString()} points! (Simulated - Set up Stripe for real payments)`});
              await refreshData();
            }
          }
        });
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout');
      }

      // Redirect to Stripe checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Purchase error:', error);
      // Fallback to simulated purchase
      setModal({
        isOpen: true,
        type: 'confirm',
        title: 'Payment Error',
        message: `Error connecting to payment processor. Simulate purchase of ${pack.points.toLocaleString()} points for $${price}?`,
        onConfirm: async () => {
          const addResult = await addPointsSupabase(pack.points, `${pack.name} purchased ($${price}) - SIMULATED`, 'purchase');
          if (addResult.success) {
            setModal({isOpen: true, type: 'success', title: 'Purchase Simulated', message: `Successfully added ${pack.points.toLocaleString()} points! (Simulated)`});
            await refreshData();
          }
        }
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Points & Billing</h1>

      {/* Current Balance Card */}
      <div className="card bg-gradient-to-br from-sky-500/20 to-sky-400/20 border-sky-500/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Current Balance</div>
            <div className="text-4xl font-bold flex items-center gap-2">
              {balance.toLocaleString()}
              <span className="text-lg text-slate-600 dark:text-slate-400">points</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
              {getPlanDetails(currentPlan).name}
              {currentPlan === 'basic' && (
                <button
                  onClick={() => handlePlanSwitch('premium')}
                  className="ml-2 text-xs bg-gradient-to-r from-sky-400 to-sky-400 text-slate-900 dark:text-slate-100 px-3 py-1 rounded-full hover:opacity-80 transition-opacity font-semibold"
                >
                  Upgrade to Premium
                </button>
              )}
            </div>
            <div className="text-2xl font-bold">${getPlanDetails(currentPlan).price}/mo</div>
            <div className="text-xs text-slate-600 dark:text-slate-400">+{getPlanDetails(currentPlan).monthlyPoints.toLocaleString()} pts monthly</div>
            {currentPlan === 'premium' && (
              <button
                onClick={() => handlePlanSwitch('basic')}
                className="mt-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 transition-colors underline"
              >
                Downgrade to Basic
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">This Week</div>
          <div className="text-2xl font-bold">{stats.totalSpent}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">points used</div>
        </div>

        <div className="card">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Daily Average</div>
          <div className="text-2xl font-bold">{stats.avgDailySpend.toFixed(1)}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">points/day</div>
        </div>

        <div className="card">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Estimated Days</div>
          <div className="text-2xl font-bold">{stats.daysRemaining > 999 ? '∞' : stats.daysRemaining}</div>
          <div className="text-xs text-slate-600 dark:text-slate-400">until refill needed</div>
        </div>

        <div className="card bg-gradient-to-br from-sky-50 to-sky-500/10 border-sky-200">
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Next Renewal</div>
          <div className="text-2xl font-bold text-sky-600">
            {daysUntilRenewal !== null ? (daysUntilRenewal <= 0 ? 'Today!' : `${daysUntilRenewal}d`) : '---'}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            +{getPlanDetails(currentPlan).monthlyPoints.toLocaleString()} pts incoming
          </div>
        </div>
      </div>

      {/* Low Balance Alert */}
      {balance <= 200 && (
        <div className="card bg-sky-500/10 border-sky-400/30">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-bold text-sky-600">Low Balance Alert</div>
              <div className="text-sm text-slate-700 dark:text-slate-300">You have {balance} points remaining. Top up to keep your AI responses flowing!</div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Points */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Buy More Points</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {POINT_PACKS.map((pack) => {
            const price = currentPlan === 'premium' ? pack.premiumPrice : pack.basePrice;
            const discount = currentPlan === 'premium' ? pack.premiumDiscount : pack.baseDiscount;
            return (
            <div
              key={pack.name}
              className={`card hover:bg-slate-50 dark:bg-slate-800 transition-all relative ${pack.popular ? 'ring-2 ring-[var(--accent)]' : ''}`}
            >
              {pack.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-slate-900 dark:text-slate-100 text-xs font-bold px-3 py-1 rounded-full shadow-lg z-10">
                  POPULAR
                </div>
              )}

              <div className="text-center mb-4">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">{pack.name}</div>
                <div className="text-3xl font-bold mb-1">
                  {pack.points.toLocaleString()}
                </div>
                {discount && (
                  <div className="text-xs text-sky-600 font-medium">{discount}</div>
                )}
              </div>

              <div className="text-center mb-4">
                <div className="text-2xl font-bold">${price}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">${(price / pack.points * 1000).toFixed(2)}/1000 pts</div>
              </div>

              <button
                onClick={() => handlePurchase(pack)}
                className="w-full bg-white text-black font-medium py-2 rounded hover:bg-white/90 transition-colors"
              >
                Purchase
              </button>
            </div>
            );
          })}
        </div>

        <div className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
          Points never expire and roll over month-to-month
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">Description</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-600 dark:text-slate-400">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white">
                      <td className="px-4 py-3 text-sm">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">{tx.description}</td>
                      <td className={`px-4 py-3 text-sm text-right font-medium ${
                        tx.action_type === 'spend' ? 'text-red-400' : 'text-sky-600'
                      }`}>
                        {tx.action_type === 'spend' ? '-' : '+'}{Math.abs(tx.points_amount).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Subscription Comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Choose Your Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Starter Plan */}
          <div className={`card relative ${currentPlan === 'basic' ? 'ring-2 ring-sky-500 bg-sky-500/10' : 'bg-white'}`}>
            {currentPlan === 'basic' && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                CURRENT PLAN
              </div>
            )}
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold mb-2">Starter</h3>
              <div className="text-3xl font-bold mb-1">$30</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">per month</div>
            </div>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span className="font-semibold text-sky-600">{SUBSCRIPTION_FEATURES.starter.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Up to {SUBSCRIPTION_FEATURES.starter.maxContacts.toLocaleString()} contacts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>{SUBSCRIPTION_FEATURES.starter.maxCampaigns} campaigns</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>{SUBSCRIPTION_FEATURES.starter.maxFlows} AI flows</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>AI responses & generation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Bulk messaging</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Email integration</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>{SUBSCRIPTION_FEATURES.starter.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Individual account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-400">Email support</span>
              </div>
            </div>
            {currentPlan !== 'basic' && (
              <button
                onClick={() => handlePlanSwitch('basic')}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2 rounded transition-colors"
              >
                {currentPlan === 'premium' ? 'Downgrade' : 'Select Plan'}
              </button>
            )}
          </div>

          {/* Professional Plan */}
          <div className={`card relative ${currentPlan === 'premium' ? 'ring-2 ring-sky-400 bg-sky-500/10' : 'bg-gradient-to-br from-sky-50 to-sky-500/10'}`}>
            {currentPlan === 'premium' && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-400 to-sky-400 text-slate-900 dark:text-slate-100 text-xs font-bold px-3 py-1 rounded-full">
                CURRENT PLAN
              </div>
            )}
            {currentPlan !== 'premium' && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-400 to-sky-400 text-slate-900 dark:text-slate-100 text-xs font-bold px-3 py-1 rounded-full">
                BEST VALUE
              </div>
            )}
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold mb-2">Professional</h3>
              <div className="text-3xl font-bold mb-1">$98</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">per month</div>
            </div>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span className="font-semibold text-sky-600">{SUBSCRIPTION_FEATURES.professional.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span className="font-semibold">Unlimited contacts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span className="font-semibold">Unlimited campaigns</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span className="font-semibold">Unlimited AI flows</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Advanced AI (GPT-4)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Advanced analytics</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Custom branding</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>API & Webhooks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>{SUBSCRIPTION_FEATURES.professional.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Unlimited team members</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Priority delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sky-600">✓</span>
                <span>Dedicated phone number</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-400 font-semibold">Priority support</span>
              </div>
            </div>
            {currentPlan !== 'premium' && (
              <button
                onClick={() => handlePlanSwitch('premium')}
                className="w-full bg-gradient-to-r from-sky-400 to-sky-400 hover:from-sky-600 hover:to-sky-600 text-slate-900 dark:text-slate-100 font-medium py-2 rounded transition-colors"
              >
                Upgrade to Professional
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="card bg-white">
        <h3 className="font-semibold mb-3">Subscription Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Plan:</span>
            <span className="font-medium">{getPlanDetails(currentPlan).name} - ${getPlanDetails(currentPlan).price}/month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Includes:</span>
            <span className="font-medium">{getPlanDetails(currentPlan).monthlyPoints.toLocaleString()} points monthly</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Next renewal:</span>
            <span className="font-medium">{daysUntilRenewal !== null && daysUntilRenewal > 0 ? `In ${daysUntilRenewal} days` : 'Today'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Points rollover:</span>
            <span className="font-medium text-sky-600">Enabled</span>
          </div>
        </div>
      </div>

      {/* Celebration Popup */}
      {showCelebration && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative bg-gradient-to-br from-sky-400 to-sky-400 p-8 rounded-2xl shadow-2xl max-w-md text-center">
            {/* Fireworks Animation */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-yellow-300 rounded-full animate-firework"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${1 + Math.random() * 2}s`
                  }}
                />
              ))}
            </div>

            <div className="relative z-10">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Thank You!</h2>
              <p className="text-lg text-gray-900/90 mb-4">
                Welcome to Premium! Enjoy better pricing on all point packs.
              </p>
              <div className="flex items-center justify-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="text-4xl">✨</span>
                <span className="text-4xl">🚀</span>
                <span className="text-4xl">💎</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({...modal, isOpen: false})}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
      />
    </div>
  );
}

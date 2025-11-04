"use client";

import { useState, useEffect } from "react";
import { loadPoints, addPoints, getRecentTransactions, getUsageStats, type PointTransaction } from "@/lib/pointsStore";

type PointPack = {
  name: string;
  points: number;
  price: number;
  discount?: string;
  popular?: boolean;
};

const POINT_PACKS: PointPack[] = [
  {
    name: "Starter",
    points: 4000,
    price: 40,
  },
  {
    name: "Pro",
    points: 10000,
    price: 90,
    discount: "10% off",
    popular: true,
  },
  {
    name: "Business",
    points: 25000,
    price: 212.50,
    discount: "15% off",
  },
  {
    name: "Enterprise",
    points: 60000,
    price: 480,
    discount: "20% off",
  },
];

export default function PointsPage() {
  const [balance, setBalance] = useState(1000);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [stats, setStats] = useState({
    totalSpent: 0,
    totalEarned: 0,
    avgDailySpend: 0,
    daysRemaining: 999
  });

  useEffect(() => {
    refreshData();

    // Handle Stripe success/cancel redirects
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const points = urlParams.get('points');
    const packName = urlParams.get('packName');

    if (success === 'true' && points) {
      handlePurchaseComplete(parseInt(points), packName || 'Point Pack');
    } else if (canceled === 'true') {
      alert('Payment canceled. No charges were made.');
      window.history.replaceState({}, '', '/points');
    }

    const handleUpdate = () => refreshData();
    window.addEventListener('pointsUpdated', handleUpdate);
    return () => window.removeEventListener('pointsUpdated', handleUpdate);
  }, []);

  async function handlePurchaseComplete(points: number, packName: string) {
    // Check if this is first purchase (needs Twilio account)
    const settings = typeof window !== 'undefined' && localStorage.getItem('trippdrip.settings.v1');
    const needsTwilioAccount = !settings || !JSON.parse(settings)?.twilio?.accountSid;

    try {
      // Complete purchase (add points + create Twilio account if needed)
      const response = await fetch('/api/payments/complete-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points,
          packName,
          createTwilioAccount: needsTwilioAccount
        })
      });

      const result = await response.json();

      if (result.success) {
        // Add points
        addPoints(points, `${packName} purchased ($${(points * 0.01).toFixed(2)})`, 'purchase');

        // If Twilio account was created, save it
        if (result.twilioAccount) {
          const { updateTwilioConfig } = await import('@/lib/settingsStore');
          updateTwilioConfig({
            accountSid: result.twilioAccount.accountSid,
            authToken: result.twilioAccount.authToken,
            phoneNumbers: [],
            purchasedNumbers: []
          });

          alert(
            `Payment successful!\n\n` +
            `• ${points.toLocaleString()} points added\n` +
            `• SMS account created\n` +
            `• Ready to purchase phone numbers!\n\n` +
            `Go to Settings → Phone Numbers to get started.`
          );
        } else {
          alert(`Payment successful! ${points.toLocaleString()} points added to your account.`);
        }
      }
    } catch (error) {
      console.error('Error completing purchase:', error);
      // Still add points even if Twilio creation failed
      addPoints(points, `${packName} purchased ($${(points * 0.01).toFixed(2)})`, 'purchase');
      alert(`Payment successful! ${points.toLocaleString()} points added to your account.`);
    }

    // Clean URL
    window.history.replaceState({}, '', '/points');
  }

  function refreshData() {
    const data = loadPoints();
    setBalance(data.balance);
    setTransactions(getRecentTransactions(20));
    setStats(getUsageStats(7));
  }

  async function handlePurchase(pack: PointPack) {
    try {
      // Try to create Stripe checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: pack.points,
          price: pack.price,
          packName: pack.name
        })
      });

      const result = await response.json();

      if (result.setup) {
        // Stripe not configured - fallback to simulated purchase
        if (confirm(`Stripe not configured yet. Simulate purchase of ${pack.points.toLocaleString()} points for $${pack.price}?`)) {
          addPoints(pack.points, `${pack.name} purchased ($${pack.price}) - SIMULATED`, 'purchase');
          alert(`Successfully added ${pack.points.toLocaleString()} points! (Simulated - Set up Stripe for real payments)`);
        }
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
      if (confirm(`Error connecting to payment processor. Simulate purchase of ${pack.points.toLocaleString()} points for $${pack.price}?`)) {
        addPoints(pack.points, `${pack.name} purchased ($${pack.price}) - SIMULATED`, 'purchase');
        alert(`Successfully added ${pack.points.toLocaleString()} points! (Simulated)`);
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Points & Billing</h1>

      {/* Current Balance Card */}
      <div className="card bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-500/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white/60 mb-1">Current Balance</div>
            <div className="text-4xl font-bold flex items-center gap-2">
              {balance.toLocaleString()}
              <span className="text-lg text-white/60">points</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-white/60 mb-1">Base Plan</div>
            <div className="text-2xl font-bold">$30/mo</div>
            <div className="text-xs text-white/60">+1,000 pts monthly</div>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-white/60 mb-1">This Week</div>
          <div className="text-2xl font-bold">{stats.totalSpent}</div>
          <div className="text-xs text-white/60">points used</div>
        </div>

        <div className="card">
          <div className="text-xs text-white/60 mb-1">Daily Average</div>
          <div className="text-2xl font-bold">{stats.avgDailySpend.toFixed(1)}</div>
          <div className="text-xs text-white/60">points/day</div>
        </div>

        <div className="card">
          <div className="text-xs text-white/60 mb-1">Estimated Days</div>
          <div className="text-2xl font-bold">{stats.daysRemaining > 999 ? '∞' : stats.daysRemaining}</div>
          <div className="text-xs text-white/60">until refill needed</div>
        </div>

        <div className="card">
          <div className="text-xs text-white/60 mb-1">This Week Added</div>
          <div className="text-2xl font-bold text-green-400">+{stats.totalEarned}</div>
          <div className="text-xs text-white/60">points earned</div>
        </div>
      </div>

      {/* Low Balance Alert */}
      {balance <= 200 && (
        <div className="card bg-orange-500/10 border-orange-500/30">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-bold text-orange-400">Low Balance Alert</div>
              <div className="text-sm text-white/70">You have {balance} points remaining. Top up to keep your AI responses flowing!</div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Points */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Buy More Points</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {POINT_PACKS.map((pack) => (
            <div
              key={pack.name}
              className={`card hover:bg-white/10 transition-all ${pack.popular ? 'ring-2 ring-[var(--accent)]' : ''}`}
            >
              {pack.popular && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[var(--accent)] text-black text-xs font-bold px-3 py-0.5 rounded-full">
                  POPULAR
                </div>
              )}

              <div className="text-center mb-4">
                <div className="text-sm text-white/60 mb-1">{pack.name}</div>
                <div className="text-3xl font-bold mb-1">
                  {pack.points.toLocaleString()}
                </div>
                {pack.discount && (
                  <div className="text-xs text-green-400 font-medium">{pack.discount}</div>
                )}
              </div>

              <div className="text-center mb-4">
                <div className="text-2xl font-bold">${pack.price}</div>
                <div className="text-xs text-white/60">${(pack.price / pack.points * 1000).toFixed(2)}/1000 pts</div>
              </div>

              <button
                onClick={() => handlePurchase(pack)}
                className="w-full bg-white text-black font-medium py-2 rounded hover:bg-white/90 transition-colors"
              >
                Purchase
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center text-sm text-white/60">
          Points never expire and roll over month-to-month
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-white/60">Description</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-white/60">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-white/60">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm">
                        {new Date(tx.timestamp).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">{tx.description}</td>
                      <td className={`px-4 py-3 text-sm text-right font-medium ${
                        tx.type === 'spend' ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {tx.type === 'spend' ? '-' : '+'}{Math.abs(tx.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="card bg-white/5">
        <h3 className="font-semibold mb-3">Subscription Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/60">Plan:</span>
            <span className="font-medium">Base Plan - $30/month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Includes:</span>
            <span className="font-medium">1,000 points monthly</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Next renewal:</span>
            <span className="font-medium">{new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Points rollover:</span>
            <span className="font-medium text-green-400">Enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPointsBalance, spendPointsForAction, addPoints } from "@/lib/pointsSupabase";
import toast from "react-hot-toast";

export default function TestPointsPage() {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();

    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      // Get balance
      const currentBalance = await getPointsBalance();
      setBalance(currentBalance);

      // Get recent transactions
      const { data: txns } = await supabase
        .from('points_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      setTransactions(txns || []);
    }
  }

  async function testAction(actionType: 'sms_sent' | 'ai_response' | 'document_upload' | 'bulk_message' | 'flow_creation', count: number = 1) {
    setLoading(true);
    try {
      const result = await spendPointsForAction(actionType, count);

      if (result.success) {
        toast.success(`✅ Successfully spent points! New balance: ${result.balance}`);
        setBalance(result.balance || 0);
        await loadData(); // Reload to show new transaction
      } else {
        toast.error(`❌ ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function testAddPoints() {
    setLoading(true);
    try {
      const result = await addPoints(100, "Test purchase", "purchase");

      if (result.success) {
        toast.success(`✅ Added 100 points! New balance: ${result.balance}`);
        setBalance(result.balance || 0);
        await loadData();
      } else {
        toast.error(`❌ ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Points System Test</h1>
        <p>Loading user data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Points System Test Page</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Test the points deduction system to verify it's working correctly</p>
      </div>

      {/* Current Balance Card */}
      <div className="card bg-gradient-to-br from-sky-500/20 to-sky-400/20 border-sky-500/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Current Balance</div>
            <div className="text-4xl font-bold">{balance.toLocaleString()} points</div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Test Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Test Point Deductions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => testAction('sms_sent')}
            disabled={loading}
            className="p-4 bg-white hover:bg-slate-50 dark:bg-slate-800 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold">Send SMS (1-to-1)</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Costs: 1 point</div>
          </button>

          <button
            onClick={() => testAction('ai_response')}
            disabled={loading}
            className="p-4 bg-white hover:bg-slate-50 dark:bg-slate-800 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold">AI Response</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Costs: 2 points</div>
          </button>

          <button
            onClick={() => testAction('document_upload')}
            disabled={loading}
            className="p-4 bg-white hover:bg-slate-50 dark:bg-slate-800 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold">Document Upload w/ AI</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Costs: 5 points</div>
          </button>

          <button
            onClick={() => testAction('bulk_message')}
            disabled={loading}
            className="p-4 bg-white hover:bg-slate-50 dark:bg-slate-800 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold">Bulk Message (per contact)</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Costs: 2 points</div>
          </button>

          <button
            onClick={() => testAction('flow_creation')}
            disabled={loading}
            className="p-4 bg-white hover:bg-slate-50 dark:bg-slate-800 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold">Flow Creation</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Costs: 15 points</div>
          </button>

          <button
            onClick={testAddPoints}
            disabled={loading}
            className="p-4 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 rounded-lg text-left transition disabled:opacity-50"
          >
            <div className="font-semibold text-sky-600">Add 100 Points (Test)</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Test point addition</div>
          </button>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400 text-sm">No transactions yet. Try testing some actions above!</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg"
              >
                <div>
                  <div className="font-medium">{txn.description}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {new Date(txn.created_at).toLocaleString()}
                  </div>
                </div>
                <div className={`font-bold ${txn.amount > 0 ? 'text-sky-600' : 'text-red-400'}`}>
                  {txn.amount > 0 ? '+' : ''}{txn.amount} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="card bg-yellow-500/10 border-yellow-500/30">
        <h3 className="font-semibold mb-2">📝 How to Test:</h3>
        <ol className="text-sm space-y-2 text-slate-700 dark:text-slate-300 list-decimal list-inside">
          <li>Check your current balance at the top</li>
          <li>Click any action button to test point deduction</li>
          <li>Watch the balance update in real-time</li>
          <li>Check the transactions list to see the deduction recorded</li>
          <li>Verify in Supabase database:
            <ul className="ml-8 mt-1 space-y-1 list-disc list-inside">
              <li>Check <code className="bg-black/30 px-1 rounded">users</code> table → <code className="bg-black/30 px-1 rounded">credits</code> column</li>
              <li>Check <code className="bg-black/30 px-1 rounded">points_transactions</code> table for all records</li>
            </ul>
          </li>
          <li>Try the "Add 100 Points" button to test point additions</li>
          <li>Try an action when balance is low to test insufficient points error</li>
        </ol>
      </div>

      {/* Database Check */}
      <div className="card bg-sky-500/10 border-sky-500/30">
        <h3 className="font-semibold mb-2">🗄️ Verify in Supabase:</h3>
        <div className="text-sm space-y-2 text-slate-700 dark:text-slate-300">
          <p>1. Go to your Supabase dashboard: <a href="https://supabase.com/dashboard/project/ljibsszhcvhwnoegweat" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Open Dashboard</a></p>
          <p>2. Navigate to Table Editor</p>
          <p>3. Check these tables:</p>
          <ul className="ml-6 space-y-1 list-disc list-inside">
            <li><strong>users</strong> → Your <code className="bg-black/30 px-1 rounded">credits</code> column should match the balance above</li>
            <li><strong>points_transactions</strong> → Should show all test transactions with timestamps</li>
          </ul>
          <p className="mt-3 text-slate-600 dark:text-slate-400">Your User ID: <code className="bg-black/30 px-1 rounded text-xs">{user.id}</code></p>
        </div>
      </div>
    </div>
  );
}

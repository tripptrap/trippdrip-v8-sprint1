'use client';

import { useState, useEffect } from 'react';
import { Coins, TrendingDown, TrendingUp, ShoppingCart, Download, Filter, ChevronLeft, ChevronRight, RefreshCw, Info, Zap, CreditCard } from 'lucide-react';
import Link from 'next/link';

interface Transaction {
  id: string;
  action_type: 'spend' | 'earn' | 'purchase' | 'subscription';
  points_amount: number;
  description: string;
  created_at: string;
  stripe_payment_intent?: string;
}

interface Summary {
  totalSpent: number;
  totalEarned: number;
  totalPurchased: number;
}

export default function CreditHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [summary, setSummary] = useState<Summary>({ totalSpent: 0, totalEarned: 0, totalPurchased: 0 });
  const [total, setTotal] = useState(0);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    loadTransactions();
  }, [typeFilter, dateFrom, dateTo, page]);

  const loadTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', pageSize.toString());
      params.set('offset', ((page - 1) * pageSize).toString());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/user/credits/history?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
        setCurrentBalance(data.currentBalance || 0);
        setSummary(data.summary || { totalSpent: 0, totalEarned: 0, totalPurchased: 0 });
      } else {
        setError(data.error || 'Failed to load credit history');
      }
    } catch {
      setError('Failed to load credit history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'spend':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'earn':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'purchase':
        return <ShoppingCart className="w-4 h-4 text-sky-500" />;
      case 'subscription':
        return <CreditCard className="w-4 h-4 text-violet-500" />;
      default:
        return <Coins className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'spend':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Spent</span>;
      case 'earn':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Earned</span>;
      case 'purchase':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">Purchased</span>;
      case 'subscription':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">Subscription</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">{type}</span>;
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Description'];
    const rows = transactions.map(t => [
      formatDate(t.created_at),
      t.action_type,
      t.points_amount.toString(),
      t.description.replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = typeFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Credit Usage History</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Track how you've used and acquired credits over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/points"
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Buy Credits
          </Link>
          <button
            onClick={exportCSV}
            disabled={transactions.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
              <Coins className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Current Balance</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{currentBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Spent</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary.totalSpent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Earned</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary.totalEarned.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Purchased</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary.totalPurchased.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Cost Info */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
        <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Credit Costs</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <span>SMS: <strong>1 credit</strong></span>
            <span>Bulk SMS: <strong>2 credits</strong></span>
            <span>AI Response: <strong>2 credits</strong></span>
            <span>Document Upload: <strong>5 credits</strong></span>
            <span>Flow Creation: <strong>15 credits</strong></span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters:</span>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="spend">Spent</option>
            <option value="earn">Earned</option>
            <option value="purchase">Purchased</option>
            <option value="subscription">Subscription</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-sky-600 hover:text-sky-700 font-medium"
            >
              Clear Filters
            </button>
          )}

          <button
            onClick={loadTransactions}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No transactions found. Start using the platform to see your credit activity here.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatDate(transaction.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(transaction.action_type)}
                        {getTypeBadge(transaction.action_type)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {transaction.description}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
                      transaction.points_amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {transaction.points_amount > 0 ? '+' : ''}{transaction.points_amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

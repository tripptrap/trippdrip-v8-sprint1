'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, TrendingUp, DollarSign, CheckCircle, XCircle, Clock, Filter, Download } from 'lucide-react';

interface SMSMessage {
  id: string;
  to_phone: string;
  message_body: string;
  twilio_status: string | null;
  cost_points: number;
  sent_at: string;
  delivered_at: string | null;
  failed_at: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  twilio_error_message: string | null;
  lead?: {
    first_name: string;
    last_name: string;
  };
  campaign?: {
    name: string;
  };
}

interface AnalyticsStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalPending: number;
  totalCost: number;
  deliveryRate: number;
}

export default function SMSAnalyticsPage() {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [stats, setStats] = useState<AnalyticsStats>({
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalPending: 0,
    totalCost: 0,
    deliveryRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month
  const [statusFilter, setStatusFilter] = useState('all'); // all, delivered, failed, pending

  useEffect(() => {
    loadAnalytics();
  }, [dateFilter, statusFilter]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (dateFilter !== 'all') params.append('dateFilter', dateFilter);
      if (statusFilter !== 'all') params.append('statusFilter', statusFilter);

      const response = await fetch(`/api/sms/analytics?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load analytics');
      }

      setMessages(data.messages || []);
      setStats(data.stats || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalPending: 0,
        totalCost: 0,
        deliveryRate: 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
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

  const formatPhone = (phone: string) => {
    // Format +18336587355 to (833) 658-7355
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const match = cleaned.match(/^1(\d{3})(\d{3})(\d{4})$/);
      if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  };

  const getStatusBadge = (status: string | null, failedAt: string | null, deliveredAt: string | null) => {
    if (failedAt || status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" />
          Failed
        </span>
      );
    }
    if (deliveredAt || status === 'delivered') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-sky-100 text-sky-700">
          <CheckCircle className="w-3 h-3" />
          Delivered
        </span>
      );
    }
    if (status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-sky-700">
          <CheckCircle className="w-3 h-3" />
          Sent
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Recipient', 'Lead', 'Campaign', 'Status', 'Message', 'Cost'];
    const rows = messages.map(msg => [
      formatDate(msg.sent_at),
      formatPhone(msg.to_phone),
      msg.lead ? `${msg.lead.first_name} ${msg.lead.last_name}` : '-',
      msg.campaign?.name || '-',
      msg.twilio_status || 'pending',
      msg.message_body.replace(/"/g, '""'),
      msg.cost_points.toString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Analytics</h1>
          <p className="text-slate-600 dark:text-slate-400">Track your SMS campaigns and delivery rates</p>
        </div>
        <button
          onClick={exportToCSV}
          disabled={messages.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Sent</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSent}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Delivered</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalDelivered}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Failed</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalFailed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Delivery Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats.deliveryRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCost} pts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters:</span>
          </div>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>

          {(dateFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setDateFilter('all');
                setStatusFilter('all');
              }}
              className="text-sm text-sky-600 hover:text-sky-700 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Messages Table */}
      <div className="bg-white rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    Loading analytics...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No SMS messages found. Send your first SMS to see analytics here.
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr key={message.id} className="hover:bg-slate-50 dark:bg-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatDate(message.sent_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatPhone(message.to_phone)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {message.lead ? (
                        <span>{message.lead.first_name} {message.lead.last_name}</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {message.campaign ? (
                        <span>{message.campaign.name}</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {message.message_body}
                      {message.twilio_error_message && (
                        <div className="text-xs text-red-600 mt-1">
                          Error: {message.twilio_error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {getStatusBadge(message.twilio_status, message.failed_at, message.delivered_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {message.cost_points} pt{message.cost_points !== 1 ? 's' : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

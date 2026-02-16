'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isAdminEmail } from '@/lib/admin';
import { format } from 'date-fns';
import {
  Users,
  MessageSquare,
  UserPlus,
  TrendingUp,
  Shield,
  Building2,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Gift,
  DollarSign
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  personal_email: string | null;
  phone: string | null;
  full_name: string;
  industry: string | null;
  use_case: string | null;
  created_at: string;
  last_sign_in: string | null;
  email_confirmed: boolean;
  account_status: string;
  plan_type: string;
  credits: number;
  total_spent: number;
  message_count: number;
  lead_count: number;
  avg_spam_score: number;
  high_spam_count: number;
  telnyx_numbers: { phone_number: string; friendly_name: string | null; status: string; created_at: string; payment_method: string | null }[];
}

interface UserMessage {
  id: string;
  body: string;
  from_phone: string;
  to_phone: string;
  direction: string;
  status: string;
  spam_score: number;
  spam_flags: string[];
  created_at: string;
  channel: string;
  provider: string;
}

interface Stats {
  totalUsers: number;
  newUsersLastWeek: number;
  newUsersLastMonth: number;
  totalMessages: number;
  messagesLast24h: number;
  totalLeads: number;
  flaggedMessages: number;
  planBreakdown: Record<string, number>;
  industryBreakdown: Record<string, number>;
  useCaseBreakdown: Record<string, number>;
}

const industryLabels: Record<string, string> = {
  insurance: 'Insurance',
  real_estate: 'Real Estate',
  solar: 'Solar',
  roofing: 'Roofing',
  home_services: 'Home Services',
  financial_services: 'Financial Services',
  healthcare: 'Healthcare',
  automotive: 'Automotive',
  retail: 'Retail / E-commerce',
  other: 'Other',
  unknown: 'Not specified',
};

const useCaseLabels: Record<string, string> = {
  lead_generation: 'Lead Generation',
  customer_followup: 'Customer Follow-up',
  sales_outreach: 'Sales Outreach',
  appointment_scheduling: 'Appointment Scheduling',
  marketing_campaigns: 'Marketing Campaigns',
  customer_support: 'Customer Support',
  other: 'Other',
  unknown: 'Not specified',
};

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterIndustry, setFilterIndustry] = useState<string>('all');
  const [filterSpam, setFilterSpam] = useState<string>('all');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; email: string; action: string; label: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [suspendDuration, setSuspendDuration] = useState<string>('24');
  const [actionReason, setActionReason] = useState<string>('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [grantCreditsModal, setGrantCreditsModal] = useState<{ userId: string; email: string; name: string; currentCredits: number } | null>(null);
  const [grantAmount, setGrantAmount] = useState<string>('1000');
  const [grantReason, setGrantReason] = useState<string>('');

  useEffect(() => {
    checkAdminAccess();
  }, []);

  async function checkAdminAccess() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      router.push('/dashboard');
      return;
    }

    setAuthorized(true);
    fetchData();
  }

  async function fetchData() {
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/stats'),
      ]);

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();

      if (usersData.ok) setUsers(usersData.users);
      if (statsData.ok) setStats(statsData.stats);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUserAction(userId: string, email: string, action: string) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId,
          userEmail: email,
          ...(action === 'suspend' ? { duration: suspendDuration === 'indefinite' ? null : Number(suspendDuration) } : {}),
          ...(action === 'suspend' && actionReason ? { reason: actionReason } : {}),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Refresh data
        if (action === 'delete') {
          setUsers(prev => prev.filter(u => u.id !== userId));
        } else {
          fetchData();
        }
      } else {
        alert(data.error || 'Action failed');
      }
    } catch (error) {
      alert('Failed to perform action');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
      setActionMenuOpen(null);
      setActionReason('');
    }
  }

  async function toggleUserMessages(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserMessages([]);
      return;
    }
    setExpandedUser(userId);
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/messages`);
      const data = await res.json();
      if (data.ok) {
        setUserMessages(data.messages);
      }
    } catch (error) {
      console.error('Failed to fetch user messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function handleGrantCredits() {
    if (!grantCreditsModal) return;
    const amount = Number(grantAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid credit amount');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant_credits',
          userId: grantCreditsModal.userId,
          userEmail: grantCreditsModal.email,
          credits: amount,
          grantReason: grantReason || `Admin granted ${amount.toLocaleString()} credits`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Update local state
        setUsers(prev => prev.map(u =>
          u.id === grantCreditsModal.userId
            ? { ...u, credits: data.newBalance }
            : u
        ));
        setGrantCreditsModal(null);
        setGrantAmount('1000');
        setGrantReason('');
      } else {
        alert(data.error || 'Failed to grant credits');
      }
    } catch (error) {
      alert('Failed to grant credits');
    } finally {
      setActionLoading(false);
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone && user.phone.includes(searchTerm));
    const matchesPlan = filterPlan === 'all' || user.plan_type === filterPlan;
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && user.account_status !== 'suspended' && user.email_confirmed) ||
      (filterStatus === 'suspended' && user.account_status === 'suspended') ||
      (filterStatus === 'pending' && !user.email_confirmed);
    const matchesIndustry = filterIndustry === 'all' || user.industry === filterIndustry;
    const matchesSpam = filterSpam === 'all' ||
      (filterSpam === 'high' && user.avg_spam_score >= 30) ||
      (filterSpam === 'medium' && user.avg_spam_score >= 10 && user.avg_spam_score < 30) ||
      (filterSpam === 'low' && user.avg_spam_score < 10) ||
      (filterSpam === 'flagged' && user.high_spam_count > 0);
    return matchesSearch && matchesPlan && matchesStatus && matchesIndustry && matchesSpam;
  });

  if (!authorized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Platform overview and user management</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalUsers}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Users</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.newUsersLastWeek}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">New (7 days)</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalMessages.toLocaleString()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Messages</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Target className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalLeads.toLocaleString()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Leads</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.flaggedMessages || 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Flagged Spam</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Plan Breakdown */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-500" />
              Plan Breakdown
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Scale</span>
                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{stats.planBreakdown.scale || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Growth</span>
                <span className="text-sm font-medium text-sky-600 dark:text-sky-400">{stats.planBreakdown.growth || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">No Plan</span>
                <span className="text-sm font-medium text-slate-500">{stats.planBreakdown.none || 0}</span>
              </div>
            </div>
          </div>

          {/* Industry Breakdown */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-500" />
              Top Industries
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.industryBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([industry, count]) => (
                  <div key={industry} className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                      {industryLabels[industry] || industry}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Use Case Breakdown */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-sky-500" />
              Top Use Cases
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.useCaseBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([useCase, count]) => (
                  <div key={useCase} className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                      {useCaseLabels[useCase] || useCase}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All Users</h3>
              <input
                type="text"
                placeholder="Search name, email, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white w-full sm:w-64"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All Plans</option>
                <option value="scale">Scale</option>
                <option value="growth">Growth</option>
                <option value="none">No Plan</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending Verification</option>
              </select>
              <select
                value={filterIndustry}
                onChange={(e) => setFilterIndustry(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All Industries</option>
                {Object.entries(industryLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={filterSpam}
                onChange={(e) => setFilterSpam(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All Spam Levels</option>
                <option value="high">High Spam (30+)</option>
                <option value="medium">Medium Spam (10-29)</option>
                <option value="low">Low Spam (&lt;10)</option>
                <option value="flagged">Has Flagged Messages</option>
              </select>
              {(filterPlan !== 'all' || filterStatus !== 'all' || filterIndustry !== 'all' || filterSpam !== 'all' || searchTerm) && (
                <button
                  onClick={() => {
                    setFilterPlan('all');
                    setFilterStatus('all');
                    setFilterIndustry('all');
                    setFilterSpam('all');
                    setSearchTerm('');
                  }}
                  className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Points</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Spent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Activity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Spam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredUsers.map((user) => (<>
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => toggleUserMessages(user.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {expandedUser === user.id ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{user.full_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      {user.personal_email && user.personal_email !== user.email && (
                        <p title="Personal email">{user.personal_email}</p>
                      )}
                      {user.phone ? (
                        <p title="Phone">{user.phone}</p>
                      ) : (
                        <p className="text-slate-400 dark:text-slate-500">No number added</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {industryLabels[user.industry || 'unknown'] || user.industry || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      user.plan_type === 'scale'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : user.plan_type === 'growth'
                        ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {user.plan_type === 'none' ? 'No Plan' : user.plan_type === 'scale' ? 'Scale' : user.plan_type === 'growth' ? 'Growth' : user.plan_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-900 dark:text-white">{user.credits.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${user.total_spent > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      {user.total_spent > 0 ? `$${user.total_spent.toFixed(2)}` : '$0'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <p>{user.message_count} msgs</p>
                      <p>{user.lead_count} leads</p>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs">
                      <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${
                        user.avg_spam_score >= 30
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : user.avg_spam_score >= 10
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}>
                        {user.avg_spam_score}
                      </span>
                      {user.high_spam_count > 0 && (
                        <p className="text-red-500 mt-0.5">{user.high_spam_count} flagged</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.account_status === 'suspended' ? (
                      <div className="flex items-center gap-1 text-orange-500">
                        <Pause className="w-4 h-4" />
                        <span className="text-xs">Suspended</span>
                      </div>
                    ) : user.email_confirmed ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-orange-500">
                        <XCircle className="w-4 h-4" />
                        <span className="text-xs">Pending</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {isAdminEmail(user.email) ? (
                      <div className="flex justify-end">
                        <span className="px-2 py-1 text-[10px] font-medium bg-gradient-to-r from-red-500 to-orange-500 text-white rounded">
                          ADMIN
                        </span>
                      </div>
                    ) : (
                    <div className="relative flex justify-end">
                      <button
                        onClick={() => setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </button>
                      {actionMenuOpen === user.id && (
                        <div className="absolute right-0 top-8 z-20 w-44 bg-white dark:bg-slate-700 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 py-1">
                          <button
                            onClick={() => {
                              setGrantCreditsModal({ userId: user.id, email: user.email, name: user.full_name, currentCredits: user.credits });
                              setActionMenuOpen(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-600"
                          >
                            <Gift className="w-4 h-4" /> Grant Credits
                          </button>
                          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
                          {user.account_status === 'suspended' ? (
                            <button
                              onClick={() => { setConfirmAction({ userId: user.id, email: user.email, action: 'unsuspend', label: 'unsuspend' }); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-600"
                            >
                              <Play className="w-4 h-4" /> Unsuspend
                            </button>
                          ) : (
                            <button
                              onClick={() => { setConfirmAction({ userId: user.id, email: user.email, action: 'suspend', label: 'suspend' }); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-600"
                            >
                              <Pause className="w-4 h-4" /> Suspend
                            </button>
                          )}
                          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
                          <button
                            onClick={() => { setConfirmAction({ userId: user.id, email: user.email, action: 'delete', label: 'permanently delete' }); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-600"
                          >
                            <Trash2 className="w-4 h-4" /> Delete Account
                          </button>
                        </div>
                      )}
                    </div>
                    )}
                  </td>
                </tr>
                {expandedUser === user.id && (
                  <tr key={`${user.id}-messages`}>
                    <td colSpan={11} className="p-0">
                      <div className="bg-slate-50 dark:bg-slate-800/80 border-t border-b border-slate-200 dark:border-slate-700 px-6 py-4">
                        {/* Owned Phone Numbers */}
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                          Owned Numbers — {user.full_name}
                        </h4>
                        {user.telnyx_numbers.length === 0 ? (
                          <p className="text-sm text-slate-500 mb-4">No phone numbers owned</p>
                        ) : (
                          <div className="mb-4 space-y-3">
                            {/* Free numbers (no payment_method) */}
                            {user.telnyx_numbers.filter(n => !n.payment_method).length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Free (Included with Plan)</p>
                                <div className="flex flex-wrap gap-2">
                                  {user.telnyx_numbers.filter(n => !n.payment_method).map((num) => (
                                    <span
                                      key={num.phone_number}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                        num.status === 'active'
                                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                          : num.status === 'pending'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        num.status === 'active' ? 'bg-green-500' : num.status === 'pending' ? 'bg-yellow-500' : 'bg-slate-400'
                                      }`} />
                                      {num.phone_number}
                                      {num.friendly_name && num.friendly_name !== num.phone_number && <span className="text-[10px] opacity-70">({num.friendly_name})</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Purchased numbers (has payment_method) */}
                            {user.telnyx_numbers.filter(n => n.payment_method).length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Purchased</p>
                                <div className="flex flex-wrap gap-2">
                                  {user.telnyx_numbers.filter(n => n.payment_method).map((num) => (
                                    <span
                                      key={num.phone_number}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                        num.status === 'active'
                                          ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                                          : num.status === 'pending'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        num.status === 'active' ? 'bg-sky-500' : num.status === 'pending' ? 'bg-yellow-500' : 'bg-slate-400'
                                      }`} />
                                      {num.phone_number}
                                      <span className="text-[10px] opacity-70">({num.payment_method === 'credits' ? 'Credits' : num.payment_method === 'stripe' ? '$1/mo' : num.payment_method})</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Recent Messages */}
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                          Recent Messages — {user.full_name}
                        </h4>
                        {messagesLoading ? (
                          <div className="flex items-center gap-2 py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                            <span className="text-sm text-slate-500">Loading messages...</span>
                          </div>
                        ) : userMessages.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">No messages found</p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-100 dark:bg-slate-700">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Date</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Dir</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">From</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">To</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Message</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Spam</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Flags</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                                {userMessages.map((msg) => (
                                  <tr key={msg.id} className="hover:bg-white dark:hover:bg-slate-700/50">
                                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                                      {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`text-xs font-medium ${msg.direction === 'outbound' || msg.direction === 'out' ? 'text-sky-600' : 'text-green-600'}`}>
                                        {msg.direction === 'outbound' || msg.direction === 'out' ? 'OUT' : 'IN'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{msg.from_phone || '-'}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{msg.to_phone || '-'}</td>
                                    <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-xs truncate" title={msg.body}>
                                      {msg.body}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                                        (msg.spam_score || 0) >= 30
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                          : (msg.spam_score || 0) >= 10
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                      }`}>
                                        {msg.spam_score || 0}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-red-500 max-w-[150px] truncate" title={msg.spam_flags?.join(', ')}>
                                      {msg.spam_flags?.length > 0 ? msg.spam_flags.join(', ') : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No users found
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      {/* Click-away listener for action menus */}
      {actionMenuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setActionMenuOpen(null)} />
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                confirmAction.action === 'delete' ? 'bg-red-100 dark:bg-red-900/30' :
                'bg-orange-100 dark:bg-orange-900/30'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  confirmAction.action === 'delete'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-orange-600 dark:text-orange-400'
                }`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white capitalize">{confirmAction.label} User</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{confirmAction.email}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Are you sure you want to <strong>{confirmAction.label}</strong> this account?
              {confirmAction.action === 'delete' && ' This action cannot be undone.'}
              {confirmAction.action === 'suspend' && ' The user will be temporarily blocked from signing in.'}
            </p>

            {confirmAction.action === 'suspend' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reason (sent to user via email)
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="e.g., Violation of terms of service, Spam activity..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 resize-none"
                />
              </div>
            )}

            {confirmAction.action === 'suspend' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Suspension Duration
                </label>
                <select
                  value={suspendDuration}
                  onChange={(e) => setSuspendDuration(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="1">1 hour</option>
                  <option value="6">6 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                  <option value="2160">90 days</option>
                  <option value="indefinite">Indefinite</option>
                </select>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmAction(null); setActionMenuOpen(null); setActionReason(''); }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUserAction(confirmAction.userId, confirmAction.email, confirmAction.action)}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 ${
                  confirmAction.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : confirmAction.action === 'unsuspend'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {actionLoading ? 'Processing...' : `Yes, ${confirmAction.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Credits Modal */}
      {grantCreditsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Grant Credits</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{grantCreditsModal.name}</p>
              </div>
            </div>

            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Current Balance:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{grantCreditsModal.currentCredits.toLocaleString()} credits</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Credits to Grant
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="1000"
                  min="1"
                  max="1000000"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {[100, 500, 1000, 5000, 10000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setGrantAmount(String(amt))}
                    className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                      grantAmount === String(amt)
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {amt >= 1000 ? `${amt / 1000}k` : amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="e.g., Compensation for service issue, promotional credits..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 resize-none"
              />
            </div>

            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-700 dark:text-emerald-300">New Balance:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {(grantCreditsModal.currentCredits + (Number(grantAmount) || 0)).toLocaleString()} credits
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGrantCreditsModal(null);
                  setGrantAmount('1000');
                  setGrantReason('');
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantCredits}
                disabled={actionLoading || !grantAmount || Number(grantAmount) <= 0}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Granting...' : `Grant ${Number(grantAmount || 0).toLocaleString()} Credits`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

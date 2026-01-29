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
  Loader2
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
  plan_type: string;
  points_balance: number;
  total_spent: number;
  message_count: number;
  lead_count: number;
}

interface Stats {
  totalUsers: number;
  newUsersLastWeek: number;
  newUsersLastMonth: number;
  totalMessages: number;
  messagesLast24h: number;
  totalLeads: number;
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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = filterPlan === 'all' || user.plan_type === filterPlan;
    return matchesSearch && matchesPlan;
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <span className="text-sm text-slate-600 dark:text-slate-400">Premium</span>
                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{stats.planBreakdown.premium || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Basic</span>
                <span className="text-sm font-medium text-sky-600 dark:text-sky-400">{stats.planBreakdown.basic || 0}</span>
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
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All Users</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">All Plans</option>
                <option value="premium">Premium</option>
                <option value="basic">Basic</option>
                <option value="none">No Plan</option>
              </select>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{user.full_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
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
                        <p className="text-slate-400 dark:text-slate-500">No phone</p>
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
                      user.plan_type === 'premium'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : user.plan_type === 'basic'
                        ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {user.plan_type === 'none' ? 'No Plan' : user.plan_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-900 dark:text-white">{user.points_balance.toLocaleString()}</span>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.email_confirmed ? (
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
                </tr>
              ))}
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
    </div>
  );
}

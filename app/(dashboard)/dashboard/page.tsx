"use client";
import { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { MessageSquare, Users, Send, Plus, Clock, ArrowRight, Wallet, Calendar, Mail, BarChart3, CheckCircle, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Lazy-load heavy modal component
const SendSMSModal = dynamic(() => import('@/components/SendSMSModal'), { ssr: false });

interface AnalyticsData {
  totalLeads: number;
  totalCampaigns: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  responseRate: number;
  conversionRate: number;
  soldLeads: number;
  totalCreditsUsed: number;
}

interface ChartDataPoint {
  date: string;
  sent: number;
  received: number;
}

interface PipelineTag {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Appointment {
  id: string;
  summary: string;
  start_time: string;
  end_time?: string;
  attendee_name?: string;
  lead_id?: string;
  leads?: { id: string; first_name: string; last_name: string; phone?: string };
}

interface UnreadThread {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  last_message_body: string;
  last_message_at: string;
  isClient: boolean;
}

export default function Dashboard(){
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');
  const [showSendModal, setShowSendModal] = useState(false);
  const [recentLeads, setRecentLeads] = useState<Array<{ id: string; name: string; phone?: string; created_at: string; status?: string; disposition?: string }>>([]);
  const [recentClients, setRecentClients] = useState<Array<{ id: string; name: string; phone?: string; created_at: string; converted_at?: string; disposition?: string }>>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);

  // New state
  const [userCredits, setUserCredits] = useState<{ credits: number; monthly_credits: number } | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [unreadThreads, setUnreadThreads] = useState<UnreadThread[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadLoading, setUnreadLoading] = useState(true);
  const [pipelineTags, setPipelineTags] = useState<PipelineTag[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  // Campaign performance & conversion funnel
  const [campaignPerf, setCampaignPerf] = useState<Array<{ id: string; name: string; totalLeads: number; messagesSent: number; responseRate: number; conversionRate: number }>>([]);
  const [campaignPerfLoading, setCampaignPerfLoading] = useState(true);
  const [funnelStages, setFunnelStages] = useState<Array<{ name: string; count: number; percentage: number }>>([]);
  const [funnelMetrics, setFunnelMetrics] = useState<{ avg_messages_before_sale: number; overall: number } | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    fetchRecentLeads();
    fetchRecentClients();
    fetchCredits();
    fetchAppointments();
    fetchUnreadThreads();
    fetchPipelineTags();
    fetchCampaignPerformance();
    fetchConversionFunnel();
  }, []);

  useEffect(() => {
    fetchChartData();
  }, [timeRange]);

  async function fetchRecentLeads() {
    try {
      const res = await fetch('/api/leads?page=1&pageSize=10');
      const data = await res.json();
      const leads = data.items || data.leads || [];
      // Filter out sold/converted leads — those go in the clients section
      const activeLeads = leads.filter((l: any) => l.disposition !== 'sold');
      setRecentLeads(activeLeads.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch recent leads:', error);
    } finally {
      setRecentLoading(false);
    }
  }

  async function fetchRecentClients() {
    try {
      const res = await fetch('/api/clients?page=1&pageSize=5');
      const data = await res.json();
      if (data.items) {
        setRecentClients(data.items.map((c: any) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
          phone: c.phone,
          created_at: c.created_at,
          converted_at: c.converted_from_lead_at,
          disposition: 'sold',
        })));
      }
    } catch (error) {
      console.error('Failed to fetch recent clients:', error);
    } finally {
      setClientsLoading(false);
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch('/api/analytics/overview');
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChartData() {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/analytics/messages-over-time?days=${timeRange}`);
      const json = await res.json();
      setChartData(json.data || []);
    } catch (error) {
      console.error('Failed to fetch chart data:', error);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }

  async function fetchCredits() {
    try {
      const res = await fetch('/api/user/profile');
      const data = await res.json();
      if (data) {
        setUserCredits({
          credits: data.credits || 0,
          monthly_credits: data.monthly_credits || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch credits:', error);
    }
  }

  async function fetchAppointments() {
    try {
      const res = await fetch('/api/appointments?filter=upcoming&limit=5');
      const data = await res.json();
      if (data.ok && data.appointments) {
        setAppointments(data.appointments.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setAppointmentsLoading(false);
    }
  }

  async function fetchUnreadThreads() {
    try {
      // Fetch threads and sold lead IDs in parallel
      const [threadsRes, clientsRes] = await Promise.all([
        fetch('/api/messages/threads'),
        fetch('/api/leads?disposition=sold&limit=1000'),
      ]);
      const threadsData = await threadsRes.json();
      const clientsData = await clientsRes.json();

      const soldLeadIds = new Set(
        (clientsData.leads || []).map((l: any) => l.id)
      );

      const threads = threadsData.threads || threadsData || [];
      const unread = threads.filter((t: any) => t.last_message_from === 'lead');
      setUnreadCount(unread.length);
      setUnreadThreads(unread.slice(0, 10).map((t: any) => ({
        id: t.id,
        lead_id: t.lead_id,
        lead_name: t.lead_name || (t.leads?.first_name ? `${t.leads.first_name} ${t.leads.last_name || ''}`.trim() : 'Unknown'),
        lead_phone: t.lead_phone || t.phone || '',
        last_message_body: t.last_message_body || t.last_message || '',
        last_message_at: t.last_message_at || t.updated_at || '',
        isClient: soldLeadIds.has(t.lead_id),
      })));
    } catch (error) {
      console.error('Failed to fetch unread threads:', error);
    } finally {
      setUnreadLoading(false);
    }
  }

  async function fetchPipelineTags() {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.ok && data.items) {
        setPipelineTags(data.items);
      }
    } catch (error) {
      console.error('Failed to fetch pipeline tags:', error);
    } finally {
      setPipelineLoading(false);
    }
  }

  async function fetchCampaignPerformance() {
    try {
      const res = await fetch('/api/analytics/campaign-performance');
      const data = await res.json();
      setCampaignPerf((data.data || []).slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch campaign performance:', error);
    } finally {
      setCampaignPerfLoading(false);
    }
  }

  async function fetchConversionFunnel() {
    try {
      const res = await fetch('/api/analytics/conversion-funnel');
      const data = await res.json();
      if (data.ok && data.funnel) {
        setFunnelStages(data.funnel.stages || []);
        setFunnelMetrics({
          avg_messages_before_sale: data.funnel.metrics?.avg_messages_before_sale || 0,
          overall: data.funnel.conversion_rates?.overall || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch conversion funnel:', error);
    } finally {
      setFunnelLoading(false);
    }
  }

  const creditPercent = userCredits
    ? Math.min(100, Math.round((userCredits.credits / Math.max(userCredits.monthly_credits, 1)) * 100))
    : 0;

  const totalPipelineLeads = pipelineTags.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-xl md:text-2xl font-semibold pl-12 md:pl-0"
      >
        Dashboard
      </motion.h1>

      {/* Key Metrics - 5 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Credit Balance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="card bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-700/50 p-4"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400">Credits</div>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {userCredits ? userCredits.credits.toLocaleString() : '...'}
          </div>
          {userCredits && (
            <div className="mt-2">
              <div className="h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${creditPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                of {userCredits.monthly_credits.toLocaleString()} monthly
              </div>
            </div>
          )}
        </motion.div>

        {/* Total Leads */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="card bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/20 dark:to-sky-800/20 border border-sky-200 dark:border-sky-700/50 p-4"
        >
          <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Total Leads</div>
          <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
            {loading ? '...' : (analytics?.totalLeads || 0).toLocaleString()}
          </div>
        </motion.div>

        {/* Response Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="card bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/20 dark:to-sky-800/20 border border-sky-200 dark:border-sky-700/50 p-4"
        >
          <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Response Rate</div>
          <div className="text-2xl md:text-3xl font-bold text-sky-600 dark:text-sky-400">
            {loading ? '...' : `${analytics?.responseRate || 0}%`}
          </div>
        </motion.div>

        {/* Conversion Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="card bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 border border-sky-200 dark:border-sky-700/50 p-4"
        >
          <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Conversion Rate</div>
          <div className="text-2xl md:text-3xl font-bold text-sky-600 dark:text-sky-400">
            {loading ? '...' : `${analytics?.conversionRate || 0}%`}
          </div>
        </motion.div>

        {/* Active Campaigns */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="card bg-gradient-to-br from-sky-50 to-orange-50 dark:from-sky-900/20 dark:to-orange-900/20 border border-sky-200 dark:border-sky-700/50 p-4"
        >
          <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Active Campaigns</div>
          <div className="text-2xl md:text-3xl font-bold text-sky-600 dark:text-sky-400">
            {loading ? '...' : (analytics?.totalCampaigns || 0).toLocaleString()}
          </div>
        </motion.div>
      </div>

      {/* Additional Stats - 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Messages Sent</div>
              <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {loading ? '...' : (analytics?.totalMessagesSent || 0).toLocaleString()}
              </div>
            </div>
            <Send className="w-8 h-8 md:w-10 md:h-10 text-sky-600 dark:text-sky-400 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Messages Received</div>
              <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {loading ? '...' : (analytics?.totalMessagesReceived || 0).toLocaleString()}
              </div>
            </div>
            <Mail className="w-8 h-8 md:w-10 md:h-10 text-sky-600 dark:text-sky-400 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Leads vs Clients</div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {loading ? '...' : ((analytics?.totalLeads || 0) - (analytics?.soldLeads || 0)).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Active</div>
                </div>
                <div className="text-slate-300 dark:text-slate-600 text-lg">/</div>
                <div>
                  <div className="text-xl md:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {loading ? '...' : (analytics?.soldLeads || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Converted</div>
                </div>
              </div>
            </div>
            <UserCheck className="w-8 h-8 md:w-10 md:h-10 text-emerald-500 dark:text-emerald-400 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* Pipeline Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="card p-4 md:p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-500" />
            Pipeline Overview
          </h2>
          <Link href="/tags" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
            Manage tags <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {pipelineLoading ? (
          <div className="h-16 flex items-center justify-center">
            <div className="animate-pulse flex gap-2 w-full">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg flex-1" />
              ))}
            </div>
          </div>
        ) : pipelineTags.length === 0 ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No pipeline stages with leads yet</p>
            <Link href="/tags" className="text-sky-600 dark:text-sky-400 text-xs hover:underline mt-1 inline-block">
              Set up your pipeline in Tags
            </Link>
          </div>
        ) : (
          <>
            {/* Horizontal segmented bar */}
            <div className="flex rounded-lg overflow-hidden h-10 mb-3">
              {pipelineTags.map((tag) => {
                const percent = totalPipelineLeads > 0 ? (tag.count / totalPipelineLeads) * 100 : 0;
                return (
                  <Link
                    key={tag.id}
                    href={`/leads?tag=${encodeURIComponent(tag.name)}`}
                    className="relative group flex items-center justify-center transition-opacity hover:opacity-80"
                    style={{ width: `${Math.max(percent, 5)}%`, backgroundColor: tag.color || '#3b82f6' }}
                    title={`${tag.name}: ${tag.count} leads`}
                  >
                    {percent > 12 && (
                      <span className="text-white text-xs font-medium truncate px-1">{tag.count}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {pipelineTags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/leads?tag=${encodeURIComponent(tag.name)}`}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                  <span>{tag.name}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{tag.count}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </motion.div>

      {/* Conversion Funnel & Campaign Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conversion Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.47 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-500" />
              Conversion Funnel
            </h2>
            {funnelMetrics && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {funnelMetrics.overall.toFixed(1)}% overall
              </span>
            )}
          </div>

          {funnelLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded" style={{ width: `${100 - i * 15}%` }} />
                </div>
              ))}
            </div>
          ) : funnelStages.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No funnel data yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {funnelStages.map((stage, i) => {
                const colors = ['bg-sky-500', 'bg-sky-400', 'bg-cyan-500', 'bg-emerald-400', 'bg-emerald-500'];
                return (
                  <div key={stage.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{stage.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">{stage.count} ({stage.percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="h-7 bg-slate-100 dark:bg-slate-700 rounded-md overflow-hidden">
                      <div
                        className={`h-full ${colors[i] || 'bg-sky-500'} rounded-md transition-all duration-500 flex items-center pl-2`}
                        style={{ width: `${Math.max(stage.percentage, 2)}%` }}
                      >
                        {stage.percentage > 15 && (
                          <span className="text-white text-[10px] font-medium">{stage.count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {funnelMetrics && funnelMetrics.avg_messages_before_sale > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  Avg {funnelMetrics.avg_messages_before_sale.toFixed(0)} messages before conversion
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* Campaign Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.48 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-sky-500" />
              Top Campaigns
            </h2>
            <Link href="/campaigns" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {campaignPerfLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-1" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : campaignPerf.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Send className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No campaign data yet</p>
              <Link href="/campaigns" className="text-sky-600 dark:text-sky-400 text-xs hover:underline mt-1 inline-block">
                Create a campaign
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Campaign</th>
                    <th className="text-center py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Leads</th>
                    <th className="text-center py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Sent</th>
                    <th className="text-center py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Response</th>
                    <th className="text-center py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {campaignPerf.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="py-2 text-slate-900 dark:text-slate-100 font-medium truncate max-w-[140px]">{c.name}</td>
                      <td className="py-2 text-center text-slate-600 dark:text-slate-400">{c.totalLeads}</td>
                      <td className="py-2 text-center text-slate-600 dark:text-slate-400">{c.messagesSent}</td>
                      <td className="py-2 text-center text-sky-600 dark:text-sky-400 font-medium">{c.responseRate}%</td>
                      <td className="py-2 text-center text-emerald-600 dark:text-emerald-400 font-medium">{c.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Appointments & Unread Messages Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Appointments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-500" />
              Upcoming Appointments
            </h2>
            <Link href="/appointments" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {appointmentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                  <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-1" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No upcoming appointments</p>
              <p className="text-xs mt-1">Appointments booked via AI Flows will show here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {appointments.map((apt) => (
                <Link
                  key={apt.id}
                  href={apt.lead_id ? `/leads?selected=${apt.lead_id}` : '/scheduled'}
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex flex-col items-center justify-center">
                    <div className="text-[10px] font-medium text-sky-600 dark:text-sky-400 leading-none">
                      {format(new Date(apt.start_time), 'MMM')}
                    </div>
                    <div className="text-sm font-bold text-sky-700 dark:text-sky-300 leading-none">
                      {format(new Date(apt.start_time), 'd')}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {apt.attendee_name || apt.leads?.first_name ? `${apt.leads?.first_name || ''} ${apt.leads?.last_name || ''}`.trim() : apt.summary || 'Appointment'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {format(new Date(apt.start_time), 'h:mm a')}
                      {apt.summary && apt.attendee_name ? ` — ${apt.summary}` : ''}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Unread Messages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-500" />
              Unread Messages
              {unreadCount > 0 && (
                <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount}
                </span>
              )}
            </h2>
            <Link href="/texts" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {unreadLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : unreadThreads.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-50 text-emerald-500" />
              <p className="text-sm">All caught up!</p>
              <p className="text-xs mt-1">No unread messages</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Lead messages */}
              {unreadThreads.filter(t => !t.isClient).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-1.5 px-2">Leads</div>
                  <div className="space-y-1">
                    {unreadThreads.filter(t => !t.isClient).slice(0, 5).map((thread) => (
                      <Link
                        key={thread.id}
                        href={`/texts?thread=${thread.id}`}
                        className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {thread.lead_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {thread.lead_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {thread.last_message_body || 'New message'}
                          </div>
                        </div>
                        {thread.last_message_at && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {/* Client messages */}
              {unreadThreads.filter(t => t.isClient).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 dark:text-emerald-400 mb-1.5 px-2">Clients</div>
                  <div className="space-y-1">
                    {unreadThreads.filter(t => t.isClient).slice(0, 5).map((thread) => (
                      <Link
                        key={thread.id}
                        href={`/texts?thread=${thread.id}`}
                        className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {thread.lead_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {thread.lead_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {thread.last_message_body || 'New message'}
                          </div>
                        </div>
                        {thread.last_message_at && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="card p-4 md:p-6"
      >
        <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-sky-500" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/leads" className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 rounded-lg transition-colors">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div><div className="text-sm font-medium text-slate-900 dark:text-slate-100">View Leads</div><div className="text-xs text-slate-500 dark:text-slate-400">Manage contacts</div></div>
          </Link>
          <button onClick={() => setShowSendModal(true)} className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30 rounded-lg transition-colors text-left">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div><div className="text-sm font-medium text-slate-900 dark:text-slate-100">Send SMS</div><div className="text-xs text-slate-500 dark:text-slate-400">Quick message</div></div>
          </button>
          <Link href="/campaigns" className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div><div className="text-sm font-medium text-slate-900 dark:text-slate-100">Campaigns</div><div className="text-xs text-slate-500 dark:text-slate-400">Bulk messaging</div></div>
          </Link>
          <Link href="/texts" className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div><div className="text-sm font-medium text-slate-900 dark:text-slate-100">Messages</div><div className="text-xs text-slate-500 dark:text-slate-400">View inbox</div></div>
          </Link>
        </div>
      </motion.div>

      {/* Recent Leads & Recent Clients — Distinct Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Leads (Active) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.65 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-500" />
              Recent Leads
            </h2>
            <Link href="/leads" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active leads yet</p>
              <Link href="/leads" className="text-sky-600 dark:text-sky-400 text-xs hover:underline mt-1 inline-block">
                Add your first lead
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads?selected=${lead.id}`}
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-xs font-medium">
                    {lead.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {lead.name || 'Unknown'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {format(new Date(lead.created_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                  {lead.status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      lead.status === 'new' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' :
                      lead.status === 'contacted' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                      lead.status === 'qualified' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {lead.status}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Clients (Converted) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="card p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-500" />
              Recent Clients
            </h2>
            <Link href="/clients" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {clientsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentClients.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No clients yet</p>
              <p className="text-xs mt-1">Leads marked as &quot;sold&quot; will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentClients.map((client) => (
                <Link
                  key={client.id}
                  href="/clients"
                  className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-medium">
                    {client.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {client.name || 'Unknown'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {client.converted_at
                        ? `Converted ${format(new Date(client.converted_at), 'MMM d')}`
                        : format(new Date(client.created_at), 'MMM d, h:mm a')
                      }
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    sold
                  </span>
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Messages Over Time Chart */}
      <div className="card bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 border border-sky-200 dark:border-sky-700/50 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-sm md:text-base">Messages Over Time</span>
          </h2>

          {/* Time Range Selector */}
          <div className="flex gap-2">
            {(['7', '30', '90'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                  timeRange === range
                    ? 'bg-sky-500 text-white shadow-lg'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {range === '7' ? '7 Days' : range === '30' ? '30 Days' : '3 Months'}
              </button>
            ))}
          </div>
        </div>

        {chartLoading ? (
          <div className="h-[300px] md:h-[400px] flex items-center justify-center text-slate-600 dark:text-slate-400">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading chart...
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] md:h-[400px] flex items-center justify-center text-slate-600 dark:text-slate-400">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No message data available</p>
            </div>
          </div>
        ) : (
          <div className="h-[300px] md:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(209,213,219,0.5)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(107,114,128,1)"
                  tick={{ fill: 'rgba(107,114,128,1)', fontSize: 11 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return format(date, 'MMM dd');
                  }}
                />
                <YAxis
                  stroke="rgba(107,114,128,1)"
                  tick={{ fill: 'rgba(107,114,128,1)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid rgba(209,213,219,0.5)',
                    borderRadius: '8px',
                    color: '#111827',
                  }}
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return format(date, 'MMM dd, yyyy');
                  }}
                />
                <Legend
                  wrapperStyle={{ color: 'rgba(55,65,81,1)', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="sent"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ fill: '#0ea5e9', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Messages Sent"
                />
                <Line
                  type="monotone"
                  dataKey="received"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ fill: '#f97316', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Messages Received"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Floating Send Message Button */}
      <motion.button
        onClick={() => setShowSendModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-sky-500 hover:bg-sky-600 text-white rounded-full shadow-lg flex items-center justify-center z-50"
        title="Send Message"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.15, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageSquare className="w-6 h-6" />
      </motion.button>

      {/* Send SMS Modal */}
      <SendSMSModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={() => {
          fetchAnalytics();
        }}
      />
    </div>
  );
}

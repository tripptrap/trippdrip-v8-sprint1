"use client";
import { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { POINT_COSTS } from "@/lib/pointsSupabase";
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';

// Lazy-load heavy components
const SendSMSModal = dynamic(() => import('@/components/SendSMSModal'), { ssr: false });
const motion = {
  div: dynamic(() => import('framer-motion').then(mod => mod.motion.div), { ssr: false }),
  h1: dynamic(() => import('framer-motion').then(mod => mod.motion.h1), { ssr: false }),
  button: dynamic(() => import('framer-motion').then(mod => mod.motion.button), { ssr: false }),
};

// Lazy-load Recharts (~600KB savings)
const LineChart = dynamic(() => import('recharts').then(mod => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const Legend = dynamic(() => import('recharts').then(mod => mod.Legend), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });

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

export default function Dashboard(){
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');
  const [showSendModal, setShowSendModal] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    fetchChartData();
  }, [timeRange]);

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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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

      {/* Additional Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Messages Sent</div>
              <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {loading ? '...' : (analytics?.totalMessagesSent || 0).toLocaleString()}
              </div>
            </div>
            <svg className="w-8 h-8 md:w-10 md:h-10 text-sky-600 dark:text-sky-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
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
            <svg className="w-8 h-8 md:w-10 md:h-10 text-sky-600 dark:text-sky-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mb-1">Leads Sold</div>
              <div className="text-xl md:text-2xl font-bold text-sky-600 dark:text-sky-400 truncate">
                {loading ? '...' : (analytics?.soldLeads || 0).toLocaleString()}
              </div>
            </div>
            <svg className="w-8 h-8 md:w-10 md:h-10 text-sky-600 dark:text-sky-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Messages Over Time Chart */}
      <div className="card bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 border border-sky-200 dark:border-sky-700/50 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
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
              <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
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

      {/* Points Cost Guide */}
      <div className="card bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 border border-sky-200 dark:border-sky-700/50 p-4 md:p-6">
        <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm md:text-base">Points Cost Guide</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
          <div className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">Single Text Message</span>
            </div>
            <span className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 ml-2 flex-shrink-0">{POINT_COSTS.sms_sent} pt</span>
          </div>

          <div className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">AI Response / Smart Reply</span>
            </div>
            <span className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 ml-2 flex-shrink-0">{POINT_COSTS.ai_response} pts</span>
          </div>

          <div className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">Document Upload w/ AI</span>
            </div>
            <span className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 ml-2 flex-shrink-0">{POINT_COSTS.document_upload} pts</span>
          </div>

          <div className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
              <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">Bulk Message (per contact)</span>
            </div>
            <span className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 ml-2 flex-shrink-0">{POINT_COSTS.bulk_message} pts</span>
          </div>

          <div className="flex items-center justify-between p-2 md:p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-orange-500 dark:text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">AI Flow Creation</span>
            </div>
            <span className="text-xs md:text-sm font-bold text-orange-500 dark:text-orange-400 ml-2 flex-shrink-0">{POINT_COSTS.flow_creation} pts</span>
          </div>
        </div>
        <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mt-3">
          Credits automatically renew every 30 days based on your subscription plan. Unused credits roll over.
        </p>
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
          // Optionally refresh analytics after sending
          fetchAnalytics();
        }}
      />
    </div>
  );
}

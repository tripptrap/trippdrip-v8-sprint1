"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Zap, MessageSquare, Users, Activity, Clock } from 'lucide-react';

interface OverviewData {
  totalLeads: number;
  totalCampaigns: number;
  totalMessages: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  responseRate: number;
  conversionRate: number;
  soldLeads: number;
  avgResponseTime: number;
  totalCreditsUsed: number;
}

interface MessagesOverTimeData {
  date: string;
  sent: number;
  received: number;
}

interface CampaignPerformance {
  id: string;
  name: string;
  totalLeads: number;
  messagesSent: number;
  messagesReceived: number;
  responseRate: number;
  conversions: number;
  conversionRate: number;
  avgResponseTime: number;
  created_at: string;
}

interface DispositionBreakdown {
  name: string;
  value: number;
  percentage: string;
  [key: string]: string | number;
}

interface AutomationStats {
  total_messages: number;
  automated_messages: number;
  manual_messages: number;
  automation_rate: number;
  by_source: Record<string, number>;
  by_flow: Array<{
    flow_id: string;
    flow_name: string;
    message_count: number;
    response_count: number;
    response_rate: number;
  }>;
  daily_breakdown: Array<{
    date: string;
    automated: number;
    manual: number;
    total: number;
  }>;
}

interface FlowPerformance {
  flow_id: string;
  flow_name: string;
  messages_sent: number;
  unique_leads: number;
  responses_received: number;
  response_rate: number;
  avg_response_time_minutes: number;
  conversion_events: number;
}

const COLORS = ['#34d399', '#3b82f6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'automation'>('overview');

  // Overview tab state
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [messagesOverTime, setMessagesOverTime] = useState<MessagesOverTimeData[]>([]);
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance[]>([]);
  const [dispositionBreakdown, setDispositionBreakdown] = useState<DispositionBreakdown[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Automation tab state
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);
  const [flowPerformance, setFlowPerformance] = useState<FlowPerformance[]>([]);
  const [automationLoading, setAutomationLoading] = useState(true);
  const [daysBack, setDaysBack] = useState(30);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewAnalytics();
    } else {
      fetchAutomationAnalytics();
    }
  }, [activeTab, daysBack]);

  const fetchOverviewAnalytics = async () => {
    setOverviewLoading(true);
    try {
      const [overviewRes, messagesRes, campaignsRes, dispositionRes] = await Promise.all([
        fetch('/api/analytics/overview'),
        fetch('/api/analytics/messages-over-time?days=30'),
        fetch('/api/analytics/campaign-performance'),
        fetch('/api/analytics/disposition-breakdown'),
      ]);

      const overviewData = await overviewRes.json();
      const messagesData = await messagesRes.json();
      const campaignsData = await campaignsRes.json();
      const dispositionData = await dispositionRes.json();

      setOverview(overviewData);
      setMessagesOverTime(messagesData.data || []);
      setCampaignPerformance(campaignsData.data || []);
      setDispositionBreakdown(dispositionData.data || []);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setOverviewLoading(false);
    }
  };

  const fetchAutomationAnalytics = async () => {
    setAutomationLoading(true);
    try {
      const response = await fetch(`/api/analytics/automation?days=${daysBack}`);
      const data = await response.json();

      if (data.ok) {
        setAutomationStats(data.stats);
        setFlowPerformance(data.flowPerformance || []);
      } else {
        console.error('Error loading automation stats:', data.error);
      }
    } catch (error) {
      console.error('Error loading automation stats:', error);
    } finally {
      setAutomationLoading(false);
    }
  };

  const sourceColors: Record<string, string> = {
    flow: 'text-emerald-400 bg-blue-900/20 border-emerald-500/30',
    drip_campaign: 'text-emerald-400 bg-teal-800/50 border-emerald-400/30',
    bulk_campaign: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30',
    scheduled: 'text-emerald-400 bg-orange-900/20 border-emerald-400/30',
    manual: 'text-gray-400 bg-gray-900/20 border-gray-500/30',
  };

  const loading = activeTab === 'overview' ? overviewLoading : automationLoading;

  return (
    <div className="min-h-screen bg-[#0b0f14] text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
            <p className="text-gray-400">Track your campaign performance and automation metrics</p>
          </div>

          {activeTab === 'automation' && (
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(parseInt(e.target.value))}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[#e7eef9] focus:outline-none focus:border-emerald-500/50"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#1a2637]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'overview'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'automation'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Automation
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-400">Loading analytics...</div>
          </div>
        ) : activeTab === 'overview' ? (
          /* Overview Tab Content */
          <>
            {/* Overview Stats */}
            {overview && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                  <div className="text-gray-400 text-sm mb-1">Total Leads</div>
                  <div className="text-3xl font-bold text-white">{overview.totalLeads}</div>
                  <div className="text-emerald-500 text-sm mt-1">{overview.soldLeads} sold</div>
                </div>

                <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                  <div className="text-gray-400 text-sm mb-1">Total Messages</div>
                  <div className="text-3xl font-bold text-white">{overview.totalMessages}</div>
                  <div className="text-gray-400 text-sm mt-1">
                    {overview.totalMessagesSent} sent • {overview.totalMessagesReceived} received
                  </div>
                </div>

                <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                  <div className="text-gray-400 text-sm mb-1">Response Rate</div>
                  <div className="text-3xl font-bold text-white">{overview.responseRate}%</div>
                  <div className="text-gray-400 text-sm mt-1">
                    Avg response: {overview.avgResponseTime}h
                  </div>
                </div>

                <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                  <div className="text-gray-400 text-sm mb-1">Conversion Rate</div>
                  <div className="text-3xl font-bold text-white">{overview.conversionRate}%</div>
                  <div className="text-gray-400 text-sm mt-1">
                    {overview.totalCreditsUsed} credits used
                  </div>
                </div>
              </div>
            )}

            {/* Messages Over Time */}
            <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Messages Over Time (Last 30 Days)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={messagesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2637" />
                  <XAxis dataKey="date" stroke="#9fb0c3" />
                  <YAxis stroke="#9fb0c3" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0d121a',
                      border: '1px solid #1a2637',
                      borderRadius: '8px',
                      color: '#e7eef9',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#3b82f6" name="Sent" strokeWidth={2} />
                  <Line type="monotone" dataKey="received" stroke="#34d399" name="Received" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Campaign Performance */}
            <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Campaign Performance</h2>
              {campaignPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={campaignPerformance.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2637" />
                    <XAxis dataKey="name" stroke="#9fb0c3" />
                    <YAxis stroke="#9fb0c3" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0d121a',
                        border: '1px solid #1a2637',
                        borderRadius: '8px',
                        color: '#e7eef9',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="responseRate" fill="#3b82f6" name="Response Rate (%)" />
                    <Bar dataKey="conversionRate" fill="#34d399" name="Conversion Rate (%)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400">No campaign data available</div>
              )}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Lead Disposition Breakdown */}
              <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Lead Disposition Breakdown</h2>
                {dispositionBreakdown.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={dispositionBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percentage }) => `${name}: ${percentage}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {dispositionBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0d121a',
                            border: '1px solid #1a2637',
                            borderRadius: '8px',
                            color: '#e7eef9',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {dispositionBreakdown.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-gray-300">{item.name}</span>
                          </div>
                          <span className="text-gray-400">
                            {item.value} ({item.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400">No disposition data available</div>
                )}
              </div>

              {/* Campaign Performance Table */}
              <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Top Performing Campaigns</h2>
                {campaignPerformance.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left border-b border-[#1a2637]">
                        <tr className="text-gray-400">
                          <th className="pb-2">Campaign</th>
                          <th className="pb-2 text-right">Response</th>
                          <th className="pb-2 text-right">Conversion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1a2637]">
                        {campaignPerformance.slice(0, 8).map((campaign) => (
                          <tr key={campaign.id} className="text-gray-300">
                            <td className="py-2">{campaign.name}</td>
                            <td className="py-2 text-right">
                              <span className="text-emerald-400">{campaign.responseRate}%</span>
                            </td>
                            <td className="py-2 text-right">
                              <span className="text-emerald-400">{campaign.conversionRate}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">No campaigns yet</div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Automation Tab Content */
          <>
            {automationStats ? (
              <>
                {/* Overview Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-900/20 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[#e7eef9]">{automationStats.total_messages || 0}</div>
                        <div className="text-sm text-[#9fb0c3]">Total Messages</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-teal-800/50 flex items-center justify-center">
                        <Zap className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[#e7eef9]">{automationStats.automated_messages || 0}</div>
                        <div className="text-sm text-[#9fb0c3]">Automated</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-900/20 flex items-center justify-center">
                        <Users className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[#e7eef9]">{automationStats.manual_messages || 0}</div>
                        <div className="text-sm text-[#9fb0c3]">Manual</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-900/20 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[#e7eef9]">{automationStats.automation_rate || 0}%</div>
                        <div className="text-sm text-[#9fb0c3]">Automation Rate</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Messages by Source */}
                <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-[#e7eef9] mb-4 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-400" />
                    Messages by Source
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {automationStats.by_source && Object.entries(automationStats.by_source).map(([source, count]) => {
                      const colorClass = sourceColors[source] || sourceColors.manual;
                      return (
                        <div key={source} className={`p-4 rounded-lg border ${colorClass}`}>
                          <div className="text-2xl font-bold mb-1">{count}</div>
                          <div className="text-xs uppercase tracking-wide opacity-80">
                            {source.replace('_', ' ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Flow Performance */}
                {flowPerformance.length > 0 && (
                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-[#e7eef9] mb-4 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-emerald-400" />
                      Flow Performance
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-[#9fb0c3]">Flow Name</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-[#9fb0c3]">Messages Sent</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-[#9fb0c3]">Unique Leads</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-[#9fb0c3]">Responses</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-[#9fb0c3]">Response Rate</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-[#9fb0c3]">Avg Response Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flowPerformance.map((flow) => (
                            <tr key={flow.flow_id} className="border-b border-white/5 hover:bg-white/5">
                              <td className="py-3 px-4 text-[#e7eef9]">{flow.flow_name}</td>
                              <td className="py-3 px-4 text-right text-[#e7eef9]">{flow.messages_sent}</td>
                              <td className="py-3 px-4 text-right text-[#e7eef9]">{flow.unique_leads}</td>
                              <td className="py-3 px-4 text-right text-[#e7eef9]">{flow.responses_received}</td>
                              <td className="py-3 px-4 text-right">
                                <span className={`px-2 py-1 rounded text-sm ${
                                  flow.response_rate >= 50 ? 'bg-emerald-900/20 text-emerald-400' :
                                  flow.response_rate >= 25 ? 'bg-orange-900/20 text-emerald-400' :
                                  'bg-red-900/20 text-red-400'
                                }`}>
                                  {flow.response_rate}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-[#e7eef9]">
                                {flow.avg_response_time_minutes ? (
                                  <span className="flex items-center justify-end gap-1">
                                    <Clock className="h-4 w-4 text-[#9fb0c3]" />
                                    {Math.round(flow.avg_response_time_minutes)}m
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Daily Breakdown */}
                {automationStats.daily_breakdown && automationStats.daily_breakdown.length > 0 && (
                  <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-[#e7eef9] mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                      Daily Breakdown
                    </h2>
                    <div className="space-y-2">
                      {automationStats.daily_breakdown.slice(0, 10).map((day) => {
                        const total = day.total || 1;
                        const automatedPercent = (day.automated / total) * 100;
                        const manualPercent = (day.manual / total) * 100;

                        return (
                          <div key={day.date} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-[#9fb0c3]">
                                {new Date(day.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              <span className="text-[#e7eef9]">{day.total} messages</span>
                            </div>
                            <div className="h-8 bg-white/5 rounded-lg overflow-hidden flex">
                              {day.automated > 0 && (
                                <div
                                  className="bg-emerald-400/50 flex items-center justify-center text-xs text-white"
                                  style={{ width: `${automatedPercent}%` }}
                                  title={`${day.automated} automated (${automatedPercent.toFixed(1)}%)`}
                                >
                                  {day.automated > 0 && automatedPercent > 15 && day.automated}
                                </div>
                              )}
                              {day.manual > 0 && (
                                <div
                                  className="bg-emerald-500/50 flex items-center justify-center text-xs text-white"
                                  style={{ width: `${manualPercent}%` }}
                                  title={`${day.manual} manual (${manualPercent.toFixed(1)}%)`}
                                >
                                  {day.manual > 0 && manualPercent > 15 && day.manual}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-emerald-400/50 rounded"></div>
                        <span className="text-[#9fb0c3]">Automated</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-emerald-500/50 rounded"></div>
                        <span className="text-[#9fb0c3]">Manual</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* No Flow Data Message */}
                {flowPerformance.length === 0 && (
                  <div className="bg-[#0d121a] border border-emerald-700/50 rounded-lg p-6 bg-blue-900/20">
                    <div className="flex items-start gap-3">
                      <Zap className="h-5 w-5 text-emerald-400 mt-1" />
                      <div>
                        <h3 className="font-semibold text-[#e7eef9] mb-2">No Flow Data Yet</h3>
                        <p className="text-sm text-[#9fb0c3]">
                          Once you start using automated flows to send messages, you'll see detailed performance metrics here including response rates, engagement times, and conversion tracking.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">
                No automation data available
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

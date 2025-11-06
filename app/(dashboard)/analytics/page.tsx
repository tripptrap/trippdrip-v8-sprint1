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

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [messagesOverTime, setMessagesOverTime] = useState<MessagesOverTimeData[]>([]);
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance[]>([]);
  const [dispositionBreakdown, setDispositionBreakdown] = useState<DispositionBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
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
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f14] text-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
          <p className="text-gray-400">Track your campaign performance and lead engagement</p>
        </div>

        {/* Overview Stats */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0d121a] border border-[#1a2637] rounded-lg p-6">
              <div className="text-gray-400 text-sm mb-1">Total Leads</div>
              <div className="text-3xl font-bold text-white">{overview.totalLeads}</div>
              <div className="text-green-500 text-sm mt-1">{overview.soldLeads} sold</div>
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
              <Line type="monotone" dataKey="received" stroke="#10b981" name="Received" strokeWidth={2} />
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
                <Bar dataKey="conversionRate" fill="#10b981" name="Conversion Rate (%)" />
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
                          <span className="text-blue-400">{campaign.responseRate}%</span>
                        </td>
                        <td className="py-2 text-right">
                          <span className="text-green-400">{campaign.conversionRate}%</span>
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
      </div>
    </div>
  );
}

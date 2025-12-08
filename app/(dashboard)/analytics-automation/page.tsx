'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Zap, MessageSquare, Users, Activity, Clock } from 'lucide-react';

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

export default function AutomationAnalyticsPage() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [flowPerformance, setFlowPerformance] = useState<FlowPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysBack, setDaysBack] = useState(30);

  useEffect(() => {
    loadStats();
  }, [daysBack]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/automation?days=${daysBack}`);
      const data = await response.json();

      if (data.ok) {
        setStats(data.stats);
        setFlowPerformance(data.flowPerformance || []);
      } else {
        console.error('Error loading automation stats:', data.error);
      }
    } catch (error) {
      console.error('Error loading automation stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#9fb0c3]">Loading automation analytics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#9fb0c3]">No automation data available</div>
      </div>
    );
  }

  const sourceColors: Record<string, string> = {
    flow: 'text-emerald-400 bg-blue-900/20 border-emerald-500/30',
    drip_campaign: 'text-emerald-400 bg-teal-800/50 border-emerald-400/30',
    bulk_campaign: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30',
    scheduled: 'text-emerald-400 bg-orange-900/20 border-emerald-400/30',
    manual: 'text-gray-400 bg-gray-900/20 border-gray-500/30',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#e7eef9]">Automation Analytics</h1>
          <p className="text-[#9fb0c3] mt-1">
            Track automated vs manual message performance and flow engagement metrics
          </p>
        </div>

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
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-900/20 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{stats.total_messages || 0}</div>
              <div className="text-sm text-[#9fb0c3]">Total Messages</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-800/50 flex items-center justify-center">
              <Zap className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{stats.automated_messages || 0}</div>
              <div className="text-sm text-[#9fb0c3]">Automated</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-900/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{stats.manual_messages || 0}</div>
              <div className="text-sm text-[#9fb0c3]">Manual</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-900/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{stats.automation_rate || 0}%</div>
              <div className="text-sm text-[#9fb0c3]">Automation Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages by Source */}
      <div className="card">
        <h2 className="text-lg font-semibold text-[#e7eef9] mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-400" />
          Messages by Source
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.by_source && Object.entries(stats.by_source).map(([source, count]) => {
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
        <div className="card">
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
      {stats.daily_breakdown && stats.daily_breakdown.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-[#e7eef9] mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Daily Breakdown
          </h2>
          <div className="space-y-2">
            {stats.daily_breakdown.slice(0, 10).map((day) => {
              const total = day.total || 1; // Avoid division by zero
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
        <div className="card bg-blue-900/20 border-emerald-700/50">
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
    </div>
  );
}

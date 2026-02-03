'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock, TrendingUp, Calendar, Info, Download, RefreshCw } from 'lucide-react';

interface HeatmapData {
  [hour: string]: {
    [day: string]: number;
  };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function BestTimesPage() {
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analytics/best-times');
      const data = await res.json();
      if (data.heatmap) {
        setHeatmap(data.heatmap);
      } else {
        setError(data.error || 'Failed to load data');
      }
    } catch {
      setError('Failed to load best times data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    if (!heatmap) return null;

    let totalResponses = 0;
    let bestHour = 0;
    let bestDay = 'Mon';
    let maxResponses = 0;
    const hourTotals: { [hour: number]: number } = {};
    const dayTotals: { [day: string]: number } = {};

    HOURS.forEach(hour => {
      hourTotals[hour] = 0;
      DAYS.forEach(day => {
        const count = heatmap[hour.toString()]?.[day] || 0;
        totalResponses += count;
        hourTotals[hour] += count;
        dayTotals[day] = (dayTotals[day] || 0) + count;
        if (count > maxResponses) {
          maxResponses = count;
          bestHour = hour;
          bestDay = day;
        }
      });
    });

    // Find best performing hour overall
    let bestHourOverall = 0;
    let bestHourCount = 0;
    Object.entries(hourTotals).forEach(([hour, count]) => {
      if (count > bestHourCount) {
        bestHourCount = count;
        bestHourOverall = parseInt(hour);
      }
    });

    // Find best performing day overall
    let bestDayOverall = 'Mon';
    let bestDayCount = 0;
    Object.entries(dayTotals).forEach(([day, count]) => {
      if (count > bestDayCount) {
        bestDayCount = count;
        bestDayOverall = day;
      }
    });

    return {
      totalResponses,
      bestHour,
      bestDay,
      maxResponses,
      bestHourOverall,
      bestDayOverall,
      hourTotals,
      dayTotals,
    };
  }, [heatmap]);

  // Get color intensity based on value
  const getColor = (value: number, max: number) => {
    if (max === 0 || value === 0) return 'bg-slate-100 dark:bg-slate-800';
    const intensity = value / max;
    if (intensity > 0.8) return 'bg-sky-600 text-white';
    if (intensity > 0.6) return 'bg-sky-500 text-white';
    if (intensity > 0.4) return 'bg-sky-400 text-white';
    if (intensity > 0.2) return 'bg-sky-300 text-sky-900';
    return 'bg-sky-200 text-sky-800';
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    return hour > 12 ? `${hour - 12}pm` : `${hour}am`;
  };

  const exportCSV = () => {
    if (!heatmap) return;

    const headers = ['Hour', ...DAYS];
    const rows = HOURS.map(hour => [
      formatHour(hour),
      ...DAYS.map(day => heatmap[hour.toString()]?.[day] || 0)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `best-send-times-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Best Send Times</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Discover when your leads are most responsive based on historical data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={!heatmap || loading}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
        <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-sky-800 dark:text-sky-200 font-medium">How to use this data</p>
          <p className="text-sm text-sky-700 dark:text-sky-300 mt-1">
            This heatmap shows when your leads respond most often. Darker colors indicate higher response rates.
            Schedule your campaigns and follow-ups during peak response times to maximize engagement.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Responses</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalResponses}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Best Hour</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatHour(stats.bestHourOverall)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                <Calendar className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Best Day</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.bestDayOverall}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Peak Responses</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.maxResponses} <span className="text-sm font-normal text-slate-500">({stats.bestDay} {formatHour(stats.bestHour)})</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Heatmap */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Response Heatmap</h2>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading heatmap data...</span>
            </div>
          </div>
        ) : heatmap && stats ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-16 text-left text-xs font-medium text-slate-500 dark:text-slate-400 pb-2">Hour</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 pb-2 px-1">
                      {day}
                    </th>
                  ))}
                  <th className="w-16 text-right text-xs font-medium text-slate-500 dark:text-slate-400 pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour}>
                    <td className="py-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {formatHour(hour)}
                    </td>
                    {DAYS.map(day => {
                      const value = heatmap[hour.toString()]?.[day] || 0;
                      return (
                        <td key={day} className="p-1">
                          <div
                            className={`w-full h-8 rounded flex items-center justify-center text-xs font-medium transition-colors ${getColor(value, stats.maxResponses)}`}
                            title={`${day} ${formatHour(hour)}: ${value} responses`}
                          >
                            {value > 0 ? value : ''}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-1 text-right text-xs font-medium text-slate-600 dark:text-slate-400">
                      {stats.hourTotals[hour]}
                    </td>
                  </tr>
                ))}
                {/* Day totals row */}
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="pt-2 text-xs font-medium text-slate-600 dark:text-slate-400">Total</td>
                  {DAYS.map(day => (
                    <td key={day} className="pt-2 text-center text-xs font-medium text-slate-600 dark:text-slate-400">
                      {stats.dayTotals[day] || 0}
                    </td>
                  ))}
                  <td className="pt-2 text-right text-xs font-bold text-slate-900 dark:text-white">
                    {stats.totalResponses}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
            No response data available yet. Start sending messages to see patterns.
          </div>
        )}

        {/* Legend */}
        {heatmap && stats && stats.totalResponses > 0 && (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>Low</span>
            <div className="flex gap-1">
              <div className="w-6 h-4 rounded bg-slate-100 dark:bg-slate-700"></div>
              <div className="w-6 h-4 rounded bg-sky-200"></div>
              <div className="w-6 h-4 rounded bg-sky-300"></div>
              <div className="w-6 h-4 rounded bg-sky-400"></div>
              <div className="w-6 h-4 rounded bg-sky-500"></div>
              <div className="w-6 h-4 rounded bg-sky-600"></div>
            </div>
            <span>High</span>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {stats && stats.totalResponses > 10 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recommendations</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Schedule campaigns around {formatHour(stats.bestHourOverall)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  This is your peak response hour with the most lead engagement.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">2</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Prioritize {stats.bestDayOverall}s for important outreach
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Your leads are most responsive on this day of the week.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">3</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Use AI Drip for automatic timing optimization
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enable AI Drip to automatically send follow-ups at optimal times.
                </p>
              </div>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

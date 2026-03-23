'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Users, CheckCircle, XCircle, Calendar, TrendingUp, ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';

interface Flow {
  id: string;
  name: string;
  description: string;
  steps: any[];
  requiredQuestions: string[];
  created_at: string;
}

interface FlowStat {
  flowId: string;
  totalSessions: number;
  completed: number;
  abandoned: number;
  active: number;
  appointmentsBooked: number;
  completionRate: number;
  avgQuestionsAnswered: number;
}

interface MergedFlowData {
  flow: Flow;
  stats: FlowStat | null;
}

export default function FlowAnalyticsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [stats, setStats] = useState<FlowStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [flowsRes, statsRes] = await Promise.all([
          fetch('/api/flows'),
          fetch('/api/conversations/completion-stats'),
        ]);
        const flowsData = await flowsRes.json();
        const statsData = await statsRes.json();

        if (flowsData.ok) setFlows(flowsData.items || []);
        if (statsData.success) setStats(statsData.stats || []);
      } catch (err) {
        console.error('Error loading flow analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Merge flows with their stats
  const mergedData: MergedFlowData[] = flows.map(flow => ({
    flow,
    stats: stats.find(s => s.flowId === flow.id) || null,
  }));

  // Aggregate totals
  const totals = stats.reduce(
    (acc, s) => ({
      sessions: acc.sessions + s.totalSessions,
      completed: acc.completed + s.completed,
      abandoned: acc.abandoned + s.abandoned,
      active: acc.active + s.active,
      appointments: acc.appointments + s.appointmentsBooked,
    }),
    { sessions: 0, completed: 0, abandoned: 0, active: 0, appointments: 0 }
  );

  const overallCompletionRate =
    totals.completed + totals.abandoned > 0
      ? Math.round((totals.completed / (totals.completed + totals.abandoned)) * 100)
      : 0;

  const selectedFlow = selectedFlowId ? mergedData.find(d => d.flow.id === selectedFlowId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Flow Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Performance metrics for your AI conversation flows
          </p>
        </div>
        <Link
          href="/ai-workflows"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Flows
        </Link>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-sky-500" />}
          label="Total Sessions"
          value={totals.sessions}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
          label="Completed"
          value={totals.completed}
        />
        <StatCard
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          label="Abandoned"
          value={totals.abandoned}
        />
        <StatCard
          icon={<Calendar className="w-5 h-5 text-violet-500" />}
          label="Appointments"
          value={totals.appointments}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
          label="Completion Rate"
          value={`${overallCompletionRate}%`}
        />
      </div>

      {/* Flow List */}
      {mergedData.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No flows yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create AI conversation flows to start seeing analytics here.
          </p>
          <Link
            href="/ai-workflows"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700"
          >
            Create a Flow
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {mergedData.map(({ flow, stats: flowStats }) => {
            const isSelected = selectedFlowId === flow.id;
            const sessions = flowStats?.totalSessions || 0;
            const completed = flowStats?.completed || 0;
            const abandoned = flowStats?.abandoned || 0;
            const active = flowStats?.active || 0;
            const appointments = flowStats?.appointmentsBooked || 0;
            const rate = flowStats?.completionRate || 0;
            const avgQuestions = flowStats?.avgQuestionsAnswered || 0;

            return (
              <div key={flow.id}>
                <button
                  onClick={() => setSelectedFlowId(isSelected ? null : flow.id)}
                  className={`w-full text-left bg-white dark:bg-slate-800 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-sky-500 ring-1 ring-sky-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{flow.name}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {flow.steps?.length || 0} steps &middot; {flow.requiredQuestions?.length || 0} required questions
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <div className="font-semibold text-slate-900 dark:text-white">{sessions}</div>
                          <div className="text-xs text-slate-500">Sessions</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-emerald-600">{completed}</div>
                          <div className="text-xs text-slate-500">Completed</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-violet-600">{appointments}</div>
                          <div className="text-xs text-slate-500">Appts</div>
                        </div>
                        <div className="text-center">
                          <div className={`font-semibold ${rate >= 50 ? 'text-emerald-600' : rate > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                            {rate}%
                          </div>
                          <div className="text-xs text-slate-500">Rate</div>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {sessions > 0 && (
                      <div className="mt-4 flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                          {completed > 0 && (
                            <div
                              className="h-full bg-emerald-500 rounded-l-full"
                              style={{ width: `${(completed / sessions) * 100}%` }}
                            />
                          )}
                          {active > 0 && (
                            <div
                              className="h-full bg-sky-500"
                              style={{ width: `${(active / sessions) * 100}%` }}
                            />
                          )}
                          {abandoned > 0 && (
                            <div
                              className="h-full bg-red-400 rounded-r-full"
                              style={{ width: `${(abandoned / sessions) * 100}%` }}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> Active</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Abandoned</span>
                        </div>
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <DetailStat label="Total Sessions" value={sessions} />
                      <DetailStat label="Completed" value={completed} color="text-emerald-600" />
                      <DetailStat label="Abandoned" value={abandoned} color="text-red-400" />
                      <DetailStat label="Active" value={active} color="text-sky-500" />
                      <DetailStat label="Appointments Booked" value={appointments} color="text-violet-600" />
                      <DetailStat label="Completion Rate" value={`${rate}%`} color={rate >= 50 ? 'text-emerald-600' : 'text-amber-500'} />
                      <DetailStat label="Avg Questions Answered" value={avgQuestions} />
                      <DetailStat label="Created" value={new Date(flow.created_at).toLocaleDateString()} />
                    </div>
                    {flow.requiredQuestions && flow.requiredQuestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Required Questions</h4>
                        <div className="flex flex-wrap gap-2">
                          {flow.requiredQuestions.map((q, i) => (
                            <span key={i} className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300">
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function DetailStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color || 'text-slate-900 dark:text-white'}`}>{value}</div>
    </div>
  );
}

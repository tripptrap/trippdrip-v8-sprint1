"use client";

import { useState, useEffect } from 'react';
import { X, RefreshCw, Calendar, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface Session {
  id: string;
  lead_id: string;
  flow_id: string | null;
  status: 'active' | 'completed' | 'abandoned' | 'recovered';
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  questions_answered: number;
  questions_total: number;
  completion_percentage: number;
  appointment_booked: boolean;
  appointment_time: string | null;
  recovery_link_sent: boolean;
  collected_info: Record<string, unknown>;
}

interface SessionsPanelProps {
  leadId: string;
  onClose: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600',
    completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    abandoned: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    recovered: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${styles[status] || 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

export default function SessionsPanel({ leadId, onClose }: SessionsPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/conversations/sessions?leadId=${leadId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setSessions(d.sessions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leadId]);

  async function handleRecover(sessionId: string) {
    try {
      const res = await fetch(`/api/conversations/recover?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.ok) {
        toast.success('Session recovered');
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, status: 'recovered' as const } : s
        ));
      } else {
        toast.error(data.error || 'Failed to recover');
      }
    } catch {
      toast.error('Failed to recover session');
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return (
    <div className="border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-80 flex flex-col h-full overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Sessions
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-2 w-32 bg-slate-100 dark:bg-slate-700/50 rounded" />
                <div className="h-2 w-24 bg-slate-100 dark:bg-slate-700/50 rounded" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No conversation sessions yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Sessions are created when AI flows engage with leads.</p>
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2"
            >
              {/* Status + date */}
              <div className="flex items-center justify-between">
                <StatusBadge status={session.status} />
                <span className="text-[10px] text-slate-400">
                  {formatDate(session.started_at)}
                </span>
              </div>

              {/* Progress bar */}
              {session.questions_total > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>{session.questions_answered}/{session.questions_total} questions</span>
                    <span>{session.completion_percentage}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        session.status === 'completed' ? 'bg-emerald-500' :
                        session.status === 'abandoned' ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${session.completion_percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Appointment info */}
              {session.appointment_booked && session.appointment_time && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Calendar className="w-3 h-3" />
                  Appt: {formatDate(session.appointment_time)}
                </div>
              )}

              {/* Completed info */}
              {session.status === 'completed' && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle className="w-3 h-3" />
                  Completed {session.completed_at ? formatDate(session.completed_at) : ''}
                </div>
              )}

              {/* Abandoned - recover button */}
              {session.status === 'abandoned' && (
                <button
                  onClick={() => handleRecover(session.id)}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-600 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Recover Session
                </button>
              )}

              {/* Collected info summary */}
              {session.collected_info && Object.keys(session.collected_info).length > 0 && (
                <div className="pt-1 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Collected Info</p>
                  <div className="space-y-0.5">
                    {Object.entries(session.collected_info).slice(0, 5).map(([key, val]) => (
                      <div key={key} className="flex items-start gap-1 text-[10px]">
                        <span className="text-slate-400 shrink-0">{key}:</span>
                        <span className="text-slate-600 dark:text-slate-300 truncate">{String(val)}</span>
                      </div>
                    ))}
                    {Object.keys(session.collected_info).length > 5 && (
                      <span className="text-[10px] text-slate-400">+{Object.keys(session.collected_info).length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

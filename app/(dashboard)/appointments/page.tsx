"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, Phone, Mail, MapPin, Trash2, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: string;
  disposition: string;
}

interface Appointment {
  id: string;
  google_event_id: string;
  lead_id: string | null;
  summary: string;
  description?: string;
  start_time: string;
  end_time: string;
  attendee_name?: string;
  attendee_email?: string;
  created_at?: string;
  leads?: Lead;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Check calendar connection status
  useEffect(() => {
    async function checkCalendarStatus() {
      try {
        const response = await fetch('/api/calendar/status');
        const data = await response.json();
        setCalendarConnected(data.connected || false);
      } catch (error) {
        console.error('Error checking calendar status:', error);
      } finally {
        setCheckingCalendar(false);
      }
    }
    checkCalendarStatus();
  }, []);

  // Load appointments
  useEffect(() => {
    loadAppointments();
  }, [filter]);

  async function loadAppointments() {
    setLoading(true);
    try {
      const response = await fetch(`/api/appointments?filter=${filter}`);
      const data = await response.json();
      if (data.ok) {
        setAppointments(data.appointments || []);
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function cancelAppointment(id: string) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/appointments?id=${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.ok) {
        setAppointments(prev => prev.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function getTimeUntil(dateString: string) {
    const now = new Date();
    const apt = new Date(dateString);
    const diff = apt.getTime() - now.getTime();

    if (diff < 0) return 'Past';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `In ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `In ${hours} hour${hours > 1 ? 's' : ''}`;

    const minutes = Math.floor(diff / (1000 * 60));
    return `In ${minutes} min${minutes > 1 ? 's' : ''}`;
  }

  function isToday(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function isTomorrow(dateString: string) {
    const date = new Date(dateString);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  }

  // Group appointments by date
  const groupedAppointments = appointments.reduce((groups, apt) => {
    const date = new Date(apt.start_time).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(apt);
    return groups;
  }, {} as Record<string, Appointment[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Appointments</h1>
          <p className="text-sm text-white/60 mt-1">
            View and manage your scheduled appointments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadAppointments}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!checkingCalendar && !calendarConnected && (
            <Link
              href="/email"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Connect Google Calendar
            </Link>
          )}
        </div>
      </div>

      {/* Calendar Status Banner */}
      {!checkingCalendar && !calendarConnected && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-yellow-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Google Calendar Not Connected</p>
              <p className="text-sm text-white/60 mt-1">
                Connect your Google Calendar to sync appointments and let the AI schedule calls with leads.
              </p>
              <Link
                href="/email"
                className="text-sm text-yellow-400 hover:text-yellow-300 font-medium mt-2 inline-block"
              >
                Connect Now →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['upcoming', 'past', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No {filter} appointments</h3>
          <p className="text-white/60 text-sm max-w-md mx-auto">
            {filter === 'upcoming'
              ? "You don't have any upcoming appointments scheduled."
              : filter === 'past'
              ? "No past appointments found."
              : "No appointments found."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedAppointments).map(([dateStr, dayAppointments]) => (
            <div key={dateStr}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isToday(dayAppointments[0].start_time)
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isTomorrow(dayAppointments[0].start_time)
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-white/10 text-white/60'
                }`}>
                  {isToday(dayAppointments[0].start_time)
                    ? 'Today'
                    : isTomorrow(dayAppointments[0].start_time)
                    ? 'Tomorrow'
                    : formatDate(dayAppointments[0].start_time)}
                </div>
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-sm text-white/40">
                  {dayAppointments.length} appointment{dayAppointments.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Appointments for this date */}
              <div className="space-y-3">
                {dayAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Time and Title */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">
                              {formatTime(apt.start_time)}
                              {apt.end_time && ` - ${formatTime(apt.end_time)}`}
                            </span>
                          </div>
                          {filter === 'upcoming' && (
                            <span className="text-xs text-white/40">
                              {getTimeUntil(apt.start_time)}
                            </span>
                          )}
                        </div>

                        {/* Summary */}
                        <h3 className="text-white font-medium mb-2">{apt.summary}</h3>

                        {/* Lead Info */}
                        {(apt.leads || apt.attendee_name) && (
                          <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                            {(apt.leads?.first_name || apt.attendee_name) && (
                              <div className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                <span>
                                  {apt.leads
                                    ? `${apt.leads.first_name} ${apt.leads.last_name}`
                                    : apt.attendee_name}
                                </span>
                              </div>
                            )}
                            {(apt.leads?.phone) && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-4 h-4" />
                                <span>{apt.leads.phone}</span>
                              </div>
                            )}
                            {(apt.leads?.email || apt.attendee_email) && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-4 h-4" />
                                <span>{apt.leads?.email || apt.attendee_email}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Description */}
                        {apt.description && (
                          <p className="text-sm text-white/40 mt-2 line-clamp-2">
                            {apt.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        {apt.leads?.id && (
                          <Link
                            href={`/leads?selected=${apt.leads.id}`}
                            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                            title="View Lead"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        {filter === 'upcoming' && (
                          <button
                            onClick={() => cancelAppointment(apt.id)}
                            disabled={deletingId === apt.id}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                            title="Cancel Appointment"
                          >
                            <Trash2 className={`w-4 h-4 ${deletingId === apt.id ? 'animate-pulse' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lead Status Badge */}
                    {apt.leads?.status && (
                      <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          apt.leads.disposition === 'qualified' ? 'bg-emerald-500/20 text-emerald-400' :
                          apt.leads.disposition === 'callback' ? 'bg-blue-500/20 text-blue-400' :
                          apt.leads.disposition === 'not_interested' ? 'bg-red-500/20 text-red-400' :
                          'bg-white/10 text-white/60'
                        }`}>
                          {apt.leads.status}
                        </span>
                        {apt.leads.disposition && (
                          <span className="text-xs text-white/40">
                            {apt.leads.disposition.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {appointments.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{appointments.length}</div>
            <div className="text-sm text-white/60">Total {filter}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {appointments.filter(a => isToday(a.start_time)).length}
            </div>
            <div className="text-sm text-white/60">Today</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {appointments.filter(a => isTomorrow(a.start_time)).length}
            </div>
            <div className="text-sm text-white/60">Tomorrow</div>
          </div>
        </div>
      )}
    </div>
  );
}

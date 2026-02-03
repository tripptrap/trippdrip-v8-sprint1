'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, Send, Settings, ExternalLink } from 'lucide-react';
import CustomModal from "@/components/CustomModal";

type FollowUp = {
  id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  due_date: string;
  status: 'pending' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reminder_type: 'manual' | 'auto_no_response' | 'auto_follow_up' | 'auto_callback';
  created_at: string;
  completed_at: string | null;
  leads?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    disposition: string | null;
  };
};

type Suggestion = {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  title: string;
  notes: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reminder_type: string;
  suggested_due_date: string;
  reason: string;
};

type ModalState = {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
  const [formData, setFormData] = useState({
    lead_id: '',
    title: '',
    notes: '',
    due_date: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  });
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [calendarType, setCalendarType] = useState<'google' | 'calendly' | 'both'>('calendly');
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [sendingCalendarLink, setSendingCalendarLink] = useState<string | null>(null);
  const [showCalendarSetup, setShowCalendarSetup] = useState(false);
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [newCalendarType, setNewCalendarType] = useState<'google' | 'calendly' | 'both'>('calendly');
  const [savingCalendarUrl, setSavingCalendarUrl] = useState(false);

  useEffect(() => {
    loadFollowUps();
    loadCalendarUrl();
  }, [statusFilter]);

  async function loadCalendarUrl() {
    try {
      // Load preferences
      const response = await fetch('/api/user/preferences');
      const data = await response.json();
      if (data.ok && data.preferences) {
        if (data.preferences.calendar_booking_url) {
          setCalendarUrl(data.preferences.calendar_booking_url);
          setNewCalendarUrl(data.preferences.calendar_booking_url);
        }
        if (data.preferences.calendar_type) {
          setCalendarType(data.preferences.calendar_type);
          setNewCalendarType(data.preferences.calendar_type);
        }
      }

      // Check Google Calendar connection
      const calResponse = await fetch('/api/calendar/status');
      const calData = await calResponse.json();
      setGoogleCalendarConnected(calData.connected || false);
    } catch (error) {
      console.error('Error loading calendar settings:', error);
    }
  }

  async function saveCalendarSettings() {
    // Validate based on type
    if ((newCalendarType === 'calendly' || newCalendarType === 'both') && !newCalendarUrl.trim()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing URL',
        message: 'Please enter your Calendly/booking URL'
      });
      return;
    }

    if ((newCalendarType === 'google' || newCalendarType === 'both') && !googleCalendarConnected) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Google Calendar Not Connected',
        message: 'Please connect your Google Calendar in Settings > Integrations first'
      });
      return;
    }

    setSavingCalendarUrl(true);
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            calendarBookingUrl: newCalendarUrl.trim() || null,
            calendarType: newCalendarType
          }
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setCalendarUrl(newCalendarUrl.trim() || null);
        setCalendarType(newCalendarType);
        setShowCalendarSetup(false);
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: 'Calendar settings saved!'
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to save calendar settings'
        });
      }
    } catch (error) {
      console.error('Error saving calendar settings:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to save calendar settings'
      });
    } finally {
      setSavingCalendarUrl(false);
    }
  }

  async function sendCalendarLink(followUp: FollowUp) {
    // Check if calendar is configured
    const hasCalendly = calendarType === 'calendly' || calendarType === 'both';
    const hasGoogle = calendarType === 'google' || calendarType === 'both';

    if (hasCalendly && !calendarUrl) {
      setShowCalendarSetup(true);
      return;
    }

    if (hasGoogle && !googleCalendarConnected) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Google Calendar Not Connected',
        message: 'Please connect your Google Calendar in Settings > Integrations'
      });
      return;
    }

    if (!hasCalendly && !hasGoogle) {
      setShowCalendarSetup(true);
      return;
    }

    if (!followUp.leads?.phone) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'This lead has no phone number to send the calendar link to.'
      });
      return;
    }

    const calendarTypeLabel = calendarType === 'both' ? 'Google Calendar slots + Calendly link'
      : calendarType === 'google' ? 'Google Calendar slots'
      : 'Calendly link';

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Send Calendar Link',
      message: `Send ${calendarTypeLabel} to ${followUp.leads.first_name} ${followUp.leads.last_name} at ${followUp.leads.phone}?`,
      onConfirm: async () => {
        setSendingCalendarLink(followUp.id);
        try {
          const response = await fetch('/api/follow-ups/send-calendar-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId: followUp.lead_id,
              followUpId: followUp.id,
              calendarType: calendarType,
            }),
          });

          const data = await response.json();
          if (data.ok) {
            await loadFollowUps();
            setModal({
              isOpen: true,
              type: 'success',
              title: 'Sent!',
              message: `Calendar link sent to ${followUp.leads?.first_name}. ${data.creditsCost} credits used.`
            });
          } else {
            setModal({
              isOpen: true,
              type: 'error',
              title: 'Error',
              message: data.error || 'Failed to send calendar link'
            });
          }
        } catch (error) {
          console.error('Error sending calendar link:', error);
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: 'Failed to send calendar link'
          });
        } finally {
          setSendingCalendarLink(null);
        }
      }
    });
  }

  async function loadFollowUps() {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await fetch(`/api/follow-ups${params}`);
      const data = await response.json();
      if (data.ok) {
        setFollowUps(data.items || []);
      }
    } catch (error) {
      console.error('Error loading follow-ups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const response = await fetch('/api/follow-ups/suggestions');
      const data = await response.json();
      if (data.ok) {
        setSuggestions(data.suggestions || []);
        setShowSuggestionsPanel(true);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function createFollowUp() {
    if (!formData.title || !formData.due_date) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please fill in required fields'
      });
      return;
    }

    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.ok) {
        await loadFollowUps();
        setShowCreateModal(false);
        resetForm();
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create follow-up'
        });
      }
    } catch (error) {
      console.error('Error creating follow-up:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to create follow-up'
      });
    }
  }

  async function updateFollowUp(id: string, updates: Partial<FollowUp>) {
    try {
      const response = await fetch('/api/follow-ups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadFollowUps();
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to update follow-up'
        });
      }
    } catch (error) {
      console.error('Error updating follow-up:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to update follow-up'
      });
    }
  }

  async function deleteFollowUp(id: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Follow-up',
      message: 'Delete this follow-up?',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/follow-ups?id=${id}`, {
            method: 'DELETE',
          });

          const data = await response.json();
          if (data.ok) {
            await loadFollowUps();
          } else {
            setModal({
              isOpen: true,
              type: 'error',
              title: 'Error',
              message: data.error || 'Failed to delete follow-up'
            });
          }
        } catch (error) {
          console.error('Error deleting follow-up:', error);
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: 'Failed to delete follow-up'
          });
        }
      }
    });
  }

  async function createFromSuggestion(suggestion: Suggestion) {
    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: suggestion.lead_id,
          title: suggestion.title,
          notes: suggestion.notes,
          due_date: suggestion.suggested_due_date,
          priority: suggestion.priority,
          reminder_type: suggestion.reminder_type,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        // Remove from suggestions
        setSuggestions(suggestions.filter(s => s.lead_id !== suggestion.lead_id));
        await loadFollowUps();
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: 'Follow-up created successfully!'
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create follow-up'
        });
      }
    } catch (error) {
      console.error('Error creating follow-up from suggestion:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to create follow-up'
      });
    }
  }

  function resetForm() {
    setFormData({
      lead_id: '',
      title: '',
      notes: '',
      due_date: '',
      priority: 'medium',
    });
    setEditingFollowUp(null);
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'urgent': return 'bg-red-900/30 text-red-300 border-red-700';
      case 'high': return 'bg-orange-900/30 text-sky-300 border-orange-700';
      case 'medium': return 'bg-blue-900/30 text-blue-300 border-sky-700';
      case 'low': return 'bg-gray-800/50 text-slate-400 dark:text-slate-500 border-gray-700';
      default: return 'bg-gray-800/50 text-slate-400 dark:text-slate-500 border-gray-700';
    }
  }

  function isOverdue(dueDate: string) {
    return new Date(dueDate) < new Date();
  }

  const filteredFollowUps = followUps;
  const pendingCount = followUps.filter(f => f.status === 'pending').length;
  const completedCount = followUps.filter(f => f.status === 'completed').length;
  const overdueCount = followUps.filter(f => f.status === 'pending' && isOverdue(f.due_date)).length;

  return (
    <div className="space-y-6">
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'confirm' ? 'Confirm' : 'OK'}
        cancelText="Cancel"
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Follow-ups & Reminders</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage your lead follow-up schedule</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCalendarSetup(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              (calendarType === 'calendly' && calendarUrl) ||
              (calendarType === 'google' && googleCalendarConnected) ||
              (calendarType === 'both' && calendarUrl && googleCalendarConnected)
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <Calendar className="w-4 h-4" />
            {calendarType === 'both' ? 'Google + Calendly'
              : calendarType === 'google' ? 'Google Calendar'
              : calendarUrl ? 'Calendly Set' : 'Set Calendar'}
          </button>
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
            className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-500 disabled:opacity-50"
          >
            {loadingSuggestions ? 'Loading...' : 'Smart Suggestions'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600"
          >
            Create Follow-up
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Pending</div>
          <div className="text-3xl font-bold text-sky-600">{pendingCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Overdue</div>
          <div className="text-3xl font-bold text-red-400">{overdueCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Completed</div>
          <div className="text-3xl font-bold text-sky-600">{completedCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total</div>
          <div className="text-3xl font-bold text-gray-900">{followUps.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card">
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded ${statusFilter === 'pending' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-2 rounded ${statusFilter === 'completed' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}
          >
            Completed ({completedCount})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded ${statusFilter === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}
          >
            All ({followUps.length})
          </button>
        </div>
      </div>

      {/* Follow-ups List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading follow-ups...</div>
        ) : filteredFollowUps.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-600 dark:text-slate-400 mb-4">
              No follow-ups yet. Create one or use Smart Suggestions to get started.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredFollowUps.map((followUp) => (
              <div key={followUp.id} className="p-4 hover:bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(followUp.priority)}`}>
                        {followUp.priority.toUpperCase()}
                      </span>
                      {isOverdue(followUp.due_date) && followUp.status === 'pending' && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-red-900/30 text-red-300 border border-red-700">
                          OVERDUE
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        followUp.status === 'completed' ? 'bg-sky-900/30 text-sky-300 border border-sky-700' :
                        followUp.status === 'cancelled' ? 'bg-gray-800/50 text-slate-400 dark:text-slate-500 border border-gray-700' :
                        'bg-yellow-900/30 text-yellow-300 border border-yellow-700'
                      }`}>
                        {followUp.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1 text-gray-900">{followUp.title}</h3>
                    {followUp.leads && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Lead: {followUp.leads.first_name} {followUp.leads.last_name} • {followUp.leads.phone}
                        {followUp.leads.disposition && ` • ${followUp.leads.disposition}`}
                      </div>
                    )}
                    {followUp.notes && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{followUp.notes}</p>
                    )}
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Due: {format(new Date(followUp.due_date), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {followUp.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateFollowUp(followUp.id, { status: 'completed' })}
                          className="px-3 py-1 text-sm bg-sky-900/30 text-sky-300 rounded hover:bg-sky-900/50 border border-sky-700"
                        >
                          Complete
                        </button>
                        {followUp.leads && (
                          <>
                            <button
                              onClick={() => sendCalendarLink(followUp)}
                              disabled={sendingCalendarLink === followUp.id}
                              className="flex items-center gap-1 px-3 py-1 text-sm bg-emerald-900/30 text-emerald-300 rounded hover:bg-emerald-900/50 border border-emerald-700 disabled:opacity-50"
                            >
                              <Calendar className="w-3 h-3" />
                              {sendingCalendarLink === followUp.id ? 'Sending...' : 'Send Calendar'}
                            </button>
                            <Link
                              href={`/texts?leadId=${followUp.lead_id}`}
                              className="px-3 py-1 text-sm bg-blue-900/30 text-blue-300 rounded hover:bg-blue-900/50 border border-sky-700"
                            >
                              Message
                            </Link>
                          </>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => deleteFollowUp(followUp.id)}
                      className="px-3 py-1 text-sm bg-red-900/30 text-red-300 rounded hover:bg-red-900/50 border border-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions Panel */}
      {showSuggestionsPanel && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border border-slate-200 dark:border-slate-700 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Smart Follow-up Suggestions</h2>
                <button
                  onClick={() => setShowSuggestionsPanel(false)}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 text-2xl"
                >
                  &times;
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                AI-powered suggestions based on lead engagement and timing
              </p>
            </div>

            <div className="p-6">
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                  No suggestions at this time. All leads are being followed up appropriately!
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(suggestion.priority)}`}>
                              {suggestion.priority.toUpperCase()}
                            </span>
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{suggestion.title}</h3>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {suggestion.lead_name} • {suggestion.lead_phone}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{suggestion.notes}</p>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Reason: {suggestion.reason}
                          </div>
                        </div>
                        <button
                          onClick={() => createFromSuggestion(suggestion)}
                          className="ml-4 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal - Simplified for now */}
      {showCreateModal && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Create Follow-up</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Note: Currently you need to create follow-ups from the leads page or use Smart Suggestions.
              Manual creation coming soon!
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Calendar Setup Modal */}
      {showCalendarSetup && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Calendar Settings</h2>
                <p className="text-sm text-slate-500">Choose how to send booking links to leads</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Calendar Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Calendar Type
                </label>
                <div className="space-y-2">
                  {/* Google Calendar Option */}
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      newCalendarType === 'google'
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calendarType"
                      value="google"
                      checked={newCalendarType === 'google'}
                      onChange={(e) => setNewCalendarType(e.target.value as any)}
                      className="w-4 h-4 text-sky-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">Google Calendar</span>
                        {googleCalendarConnected ? (
                          <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full">Connected</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full">Not Connected</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Send available time slots from your Google Calendar
                      </p>
                    </div>
                  </label>

                  {/* Calendly Option */}
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      newCalendarType === 'calendly'
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calendarType"
                      value="calendly"
                      checked={newCalendarType === 'calendly'}
                      onChange={(e) => setNewCalendarType(e.target.value as any)}
                      className="w-4 h-4 text-sky-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-white">Calendly / External Link</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Send your Calendly, Cal.com, or any booking URL
                      </p>
                    </div>
                  </label>

                  {/* Both Option */}
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      newCalendarType === 'both'
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calendarType"
                      value="both"
                      checked={newCalendarType === 'both'}
                      onChange={(e) => setNewCalendarType(e.target.value as any)}
                      className="w-4 h-4 text-sky-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-white">Both</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Send Google Calendar slots + your booking link
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Calendly URL Input - show if calendly or both */}
              {(newCalendarType === 'calendly' || newCalendarType === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Your Booking URL
                  </label>
                  <input
                    type="url"
                    value={newCalendarUrl}
                    onChange={(e) => setNewCalendarUrl(e.target.value)}
                    placeholder="https://calendly.com/yourname"
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Works with Calendly, Cal.com, Acuity, or any booking link
                  </p>
                </div>
              )}

              {/* Google Calendar Warning */}
              {(newCalendarType === 'google' || newCalendarType === 'both') && !googleCalendarConnected && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Google Calendar is not connected. Go to{' '}
                    <Link href="/integrations" className="underline font-medium">
                      Settings → Integrations
                    </Link>{' '}
                    to connect it.
                  </p>
                </div>
              )}

              {/* Current Settings Display */}
              {calendarUrl && (newCalendarType === 'calendly' || newCalendarType === 'both') && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <ExternalLink className="w-4 h-4" />
                    <span className="font-medium">Current booking link:</span>
                  </div>
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-emerald-500 hover:underline break-all"
                  >
                    {calendarUrl}
                  </a>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCalendarSetup(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCalendarSettings}
                  disabled={savingCalendarUrl}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                >
                  {savingCalendarUrl ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-50 dark:bg-slate-800/50 border-sky-700/50">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Smart Follow-up System</h3>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <li>• Click "Smart Suggestions" to see AI-powered follow-up recommendations</li>
          <li>• Suggestions are based on lead engagement, response times, and disposition</li>
          <li>• Urgent priorities are for hot leads that need immediate attention</li>
          <li>• Complete follow-ups to mark them as done and track your progress</li>
          <li>• Click "Message" to quickly reach out to a lead from their follow-up</li>
          <li>• <strong>New:</strong> Click "Send Calendar" to send your booking link via SMS</li>
          <li>• Set up your calendar link (Calendly, Cal.com, etc.) using the button above</li>
        </ul>
      </div>
    </div>
  );
}

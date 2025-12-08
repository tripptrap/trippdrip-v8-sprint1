'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
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

  useEffect(() => {
    loadFollowUps();
  }, [statusFilter]);

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
      case 'high': return 'bg-orange-900/30 text-emerald-300 border-orange-700';
      case 'medium': return 'bg-blue-900/30 text-blue-300 border-emerald-700';
      case 'low': return 'bg-gray-800/50 text-gray-400 border-gray-700';
      default: return 'bg-gray-800/50 text-gray-400 border-gray-700';
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
          <h1 className="text-2xl font-semibold text-[#e7eef9]">Follow-ups & Reminders</h1>
          <p className="text-[#9fb0c3] mt-1">Manage your lead follow-up schedule</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
            className="bg-emerald-400 text-white px-4 py-2 rounded-lg hover:bg-emerald-400 disabled:opacity-50"
          >
            {loadingSuggestions ? 'Loading...' : 'Smart Suggestions'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600"
          >
            Create Follow-up
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Pending</div>
          <div className="text-3xl font-bold text-emerald-400">{pendingCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Overdue</div>
          <div className="text-3xl font-bold text-red-400">{overdueCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Completed</div>
          <div className="text-3xl font-bold text-emerald-400">{completedCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Total</div>
          <div className="text-3xl font-bold text-[#e7eef9]">{followUps.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card">
        <div className="flex gap-2 border-b border-[#223246] pb-2">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded ${statusFilter === 'pending' ? 'bg-emerald-500 text-white' : 'bg-[#0c1420] text-[#9fb0c3] border border-[#223246]'}`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-2 rounded ${statusFilter === 'completed' ? 'bg-emerald-500 text-white' : 'bg-[#0c1420] text-[#9fb0c3] border border-[#223246]'}`}
          >
            Completed ({completedCount})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded ${statusFilter === 'all' ? 'bg-emerald-500 text-white' : 'bg-[#0c1420] text-[#9fb0c3] border border-[#223246]'}`}
          >
            All ({followUps.length})
          </button>
        </div>
      </div>

      {/* Follow-ups List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-[#9fb0c3]">Loading follow-ups...</div>
        ) : filteredFollowUps.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-[#9fb0c3] mb-4">
              No follow-ups yet. Create one or use Smart Suggestions to get started.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#223246]">
            {filteredFollowUps.map((followUp) => (
              <div key={followUp.id} className="p-4 hover:bg-[#0c1420]/50">
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
                        followUp.status === 'completed' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700' :
                        followUp.status === 'cancelled' ? 'bg-gray-800/50 text-gray-400 border border-gray-700' :
                        'bg-yellow-900/30 text-yellow-300 border border-yellow-700'
                      }`}>
                        {followUp.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1 text-[#e7eef9]">{followUp.title}</h3>
                    {followUp.leads && (
                      <div className="text-sm text-[#9fb0c3] mb-1">
                        Lead: {followUp.leads.first_name} {followUp.leads.last_name} • {followUp.leads.phone}
                        {followUp.leads.disposition && ` • ${followUp.leads.disposition}`}
                      </div>
                    )}
                    {followUp.notes && (
                      <p className="text-sm text-[#9fb0c3] mb-2">{followUp.notes}</p>
                    )}
                    <div className="text-sm text-[#5a6b7f]">
                      Due: {format(new Date(followUp.due_date), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {followUp.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateFollowUp(followUp.id, { status: 'completed' })}
                          className="px-3 py-1 text-sm bg-emerald-900/30 text-emerald-300 rounded hover:bg-emerald-900/50 border border-emerald-700"
                        >
                          Complete
                        </button>
                        {followUp.leads && (
                          <Link
                            href={`/texts?leadId=${followUp.lead_id}`}
                            className="px-3 py-1 text-sm bg-blue-900/30 text-blue-300 rounded hover:bg-blue-900/50 border border-emerald-700"
                          >
                            Message
                          </Link>
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
          <div className="bg-[#0f1722] border border-[#1a2637] rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-[#1a2637]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#e7eef9]">Smart Follow-up Suggestions</h2>
                <button
                  onClick={() => setShowSuggestionsPanel(false)}
                  className="text-[#9fb0c3] hover:text-[#e7eef9] text-2xl"
                >
                  &times;
                </button>
              </div>
              <p className="text-sm text-[#9fb0c3] mt-2">
                AI-powered suggestions based on lead engagement and timing
              </p>
            </div>

            <div className="p-6">
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-[#9fb0c3]">
                  No suggestions at this time. All leads are being followed up appropriately!
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="bg-[#0c1420] border border-[#223246] rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(suggestion.priority)}`}>
                              {suggestion.priority.toUpperCase()}
                            </span>
                          </div>
                          <h3 className="font-semibold text-[#e7eef9] mb-1">{suggestion.title}</h3>
                          <div className="text-sm text-[#9fb0c3] mb-2">
                            {suggestion.lead_name} • {suggestion.lead_phone}
                          </div>
                          <p className="text-sm text-[#9fb0c3] mb-2">{suggestion.notes}</p>
                          <div className="text-xs text-[#5a6b7f]">
                            Reason: {suggestion.reason}
                          </div>
                        </div>
                        <button
                          onClick={() => createFromSuggestion(suggestion)}
                          className="ml-4 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
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
          <div className="bg-[#0f1722] border border-[#1a2637] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-[#e7eef9]">Create Follow-up</h2>
            <p className="text-sm text-[#9fb0c3] mb-4">
              Note: Currently you need to create follow-ups from the leads page or use Smart Suggestions.
              Manual creation coming soon!
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="w-full px-4 py-2 bg-[#0c1420] border border-[#223246] rounded-lg text-[#e7eef9] hover:bg-[#101b2a]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-900/20 border-emerald-700/50">
        <h3 className="font-semibold mb-2 text-[#e7eef9]">Smart Follow-up System</h3>
        <ul className="text-sm text-[#9fb0c3] space-y-1">
          <li>• Click "Smart Suggestions" to see AI-powered follow-up recommendations</li>
          <li>• Suggestions are based on lead engagement, response times, and disposition</li>
          <li>• Urgent priorities are for hot leads that need immediate attention</li>
          <li>• Complete follow-ups to mark them as done and track your progress</li>
          <li>• Click "Message" to quickly reach out to a lead from their follow-up</li>
        </ul>
      </div>
    </div>
  );
}

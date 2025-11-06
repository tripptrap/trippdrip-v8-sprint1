'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

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
      alert('Please fill in required fields');
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
        alert(data.error || 'Failed to create follow-up');
      }
    } catch (error) {
      console.error('Error creating follow-up:', error);
      alert('Failed to create follow-up');
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
        alert(data.error || 'Failed to update follow-up');
      }
    } catch (error) {
      console.error('Error updating follow-up:', error);
      alert('Failed to update follow-up');
    }
  }

  async function deleteFollowUp(id: string) {
    if (!confirm('Delete this follow-up?')) return;

    try {
      const response = await fetch(`/api/follow-ups?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.ok) {
        await loadFollowUps();
      } else {
        alert(data.error || 'Failed to delete follow-up');
      }
    } catch (error) {
      console.error('Error deleting follow-up:', error);
      alert('Failed to delete follow-up');
    }
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
        alert('Follow-up created successfully!');
      } else {
        alert(data.error || 'Failed to create follow-up');
      }
    } catch (error) {
      console.error('Error creating follow-up from suggestion:', error);
      alert('Failed to create follow-up');
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
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Follow-ups & Reminders</h1>
          <p className="text-gray-600 mt-1">Manage your lead follow-up schedule</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
            className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50"
          >
            {loadingSuggestions ? 'Loading...' : 'Smart Suggestions'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
          >
            Create Follow-up
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Pending</div>
          <div className="text-3xl font-bold text-blue-600">{pendingCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Overdue</div>
          <div className="text-3xl font-bold text-red-600">{overdueCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Completed</div>
          <div className="text-3xl font-bold text-green-600">{completedCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total</div>
          <div className="text-3xl font-bold">{followUps.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card">
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded ${statusFilter === 'pending' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-2 rounded ${statusFilter === 'completed' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            Completed ({completedCount})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded ${statusFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            All ({followUps.length})
          </button>
        </div>
      </div>

      {/* Follow-ups List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading follow-ups...</div>
        ) : filteredFollowUps.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-600 mb-4">
              No follow-ups yet. Create one or use Smart Suggestions to get started.
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filteredFollowUps.map((followUp) => (
              <div key={followUp.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(followUp.priority)}`}>
                        {followUp.priority.toUpperCase()}
                      </span>
                      {isOverdue(followUp.due_date) && followUp.status === 'pending' && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                          OVERDUE
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        followUp.status === 'completed' ? 'bg-green-100 text-green-800' :
                        followUp.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {followUp.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1">{followUp.title}</h3>
                    {followUp.leads && (
                      <div className="text-sm text-gray-600 mb-1">
                        Lead: {followUp.leads.first_name} {followUp.leads.last_name} • {followUp.leads.phone}
                        {followUp.leads.disposition && ` • ${followUp.leads.disposition}`}
                      </div>
                    )}
                    {followUp.notes && (
                      <p className="text-sm text-gray-600 mb-2">{followUp.notes}</p>
                    )}
                    <div className="text-sm text-gray-500">
                      Due: {format(new Date(followUp.due_date), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {followUp.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateFollowUp(followUp.id, { status: 'completed' })}
                          className="px-3 py-1 text-sm bg-green-50 text-green-600 rounded hover:bg-green-100"
                        >
                          Complete
                        </button>
                        {followUp.leads && (
                          <Link
                            href={`/texts?leadId=${followUp.lead_id}`}
                            className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                          >
                            Message
                          </Link>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => deleteFollowUp(followUp.id)}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
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
                          className="ml-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
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
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold mb-2">Smart Follow-up System</h3>
        <ul className="text-sm text-gray-700 space-y-1">
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

"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Clock, User, Phone, DollarSign, RefreshCw, X, Send, CheckSquare, Square, Loader2, Calendar, Zap, Megaphone, Users } from "lucide-react";
import CustomModal from "@/components/CustomModal";

interface ScheduledMessage {
  id: string;
  lead_id: string;
  channel: 'sms' | 'email';
  subject?: string;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string;
  credits_cost: number;
  segments: number;
  created_at: string;
  source?: 'manual' | 'drip' | 'campaign' | 'bulk';
  campaign_id?: string;
  leads?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
}

type SourceFilter = 'all' | 'manual' | 'drip' | 'campaign' | 'bulk';

interface SourceCounts {
  all: number;
  manual: number;
  drip: number;
  campaign: number;
  bulk: number;
}

type ModalState = {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function ScheduledMessagesPage() {
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'cancel' | 'send' | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [counts, setCounts] = useState<SourceCounts>({ all: 0, manual: 0, drip: 0, campaign: 0, bulk: 0 });
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const pendingMessages = scheduledMessages.filter(m => m.status === 'pending');
  const allSelected = pendingMessages.length > 0 && pendingMessages.every(m => selectedIds.has(m.id));
  const someSelected = selectedIds.size > 0;

  useEffect(() => {
    fetchScheduledMessages();
  }, [sourceFilter]);

  async function fetchScheduledMessages() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') {
        params.set('source', sourceFilter);
      }
      const response = await fetch(`/api/messages/schedule?${params.toString()}`);
      const data = await response.json();

      if (data.ok) {
        setScheduledMessages(data.scheduledMessages);
        if (data.counts) {
          setCounts(data.counts);
        }
        // Clear selection when refreshing
        setSelectedIds(new Set());
      } else {
        toast.error(data.error || 'Failed to load scheduled messages');
      }
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
      toast.error('Failed to load scheduled messages');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingMessages.map(m => m.id)));
    }
  }

  async function cancelMessage(messageId: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Cancel Message',
      message: 'Are you sure you want to cancel this scheduled message?',
      onConfirm: async () => {
        setCancelling(messageId);
        try {
          const response = await fetch(`/api/messages/schedule?id=${messageId}`, {
            method: 'DELETE',
          });
          const data = await response.json();

          if (data.ok) {
            toast.success('Message cancelled successfully');
            setScheduledMessages(prev => prev.filter(msg => msg.id !== messageId));
          } else {
            toast.error(data.error || 'Failed to cancel message');
          }
        } catch (error) {
          console.error('Error cancelling message:', error);
          toast.error('Failed to cancel message');
        } finally {
          setCancelling(null);
        }
      }
    });
  }

  async function handleBulkCancel() {
    if (selectedIds.size === 0) return;

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Cancel Selected Messages',
      message: `Are you sure you want to cancel ${selectedIds.size} scheduled message${selectedIds.size > 1 ? 's' : ''}?`,
      onConfirm: async () => {
        setBulkAction('cancel');
        try {
          const response = await fetch('/api/messages/schedule/bulk', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'cancel',
              messageIds: Array.from(selectedIds),
            }),
          });
          const data = await response.json();

          if (data.ok) {
            toast.success(`${data.cancelled} message${data.cancelled > 1 ? 's' : ''} cancelled`);
            setScheduledMessages(prev => prev.filter(msg => !selectedIds.has(msg.id)));
            setSelectedIds(new Set());
          } else {
            toast.error(data.error || 'Failed to cancel messages');
          }
        } catch (error) {
          console.error('Error bulk cancelling:', error);
          toast.error('Failed to cancel messages');
        } finally {
          setBulkAction(null);
        }
      }
    });
  }

  async function handleBulkSendNow() {
    if (selectedIds.size === 0) return;

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Send Messages Now',
      message: `Are you sure you want to send ${selectedIds.size} message${selectedIds.size > 1 ? 's' : ''} immediately? Credits will be deducted.`,
      onConfirm: async () => {
        setBulkAction('send');
        try {
          const response = await fetch('/api/messages/schedule/bulk', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'send-now',
              messageIds: Array.from(selectedIds),
            }),
          });
          const data = await response.json();

          if (data.ok) {
            toast.success(`Sent ${data.sent} message${data.sent > 1 ? 's' : ''}${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
            fetchScheduledMessages(); // Refresh to show updated statuses
          } else {
            toast.error(data.error || 'Failed to send messages');
          }
        } catch (error) {
          console.error('Error bulk sending:', error);
          toast.error('Failed to send messages');
        } finally {
          setBulkAction(null);
        }
      }
    });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'text-sky-600 bg-sky-500/10 border-sky-200 dark:border-sky-800';
      case 'sent': return 'text-emerald-600 bg-emerald-500/10 border-emerald-200 dark:border-emerald-800';
      case 'failed': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'cancelled': return 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/10 border-slate-200 dark:border-slate-700';
      default: return 'text-slate-600 dark:text-slate-400 bg-white border-slate-200 dark:border-slate-700';
    }
  }

  function getTimeUntil(scheduledFor: string) {
    const now = new Date();
    const scheduled = new Date(scheduledFor);
    const diffMs = scheduled.getTime() - now.getTime();

    if (diffMs < 0) {
      return 'Overdue';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else if (diffMins > 0) {
      return `in ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    } else {
      return 'in less than a minute';
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Scheduled Messages</h1>
        <div className="card">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Scheduled Messages</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            View and manage your scheduled messages
          </p>
        </div>
        <button
          onClick={fetchScheduledMessages}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-slate-100 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Source Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        {[
          { key: 'all' as SourceFilter, label: 'All', icon: Calendar, count: counts.all },
          { key: 'manual' as SourceFilter, label: 'Manual', icon: Clock, count: counts.manual },
          { key: 'drip' as SourceFilter, label: 'Drip', icon: Zap, count: counts.drip },
          { key: 'campaign' as SourceFilter, label: 'Campaign', icon: Megaphone, count: counts.campaign },
          { key: 'bulk' as SourceFilter, label: 'Bulk', icon: Users, count: counts.bulk },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setSourceFilter(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              sourceFilter === key
                ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                sourceFilter === key
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {pendingMessages.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {allSelected ? (
              <CheckSquare className="w-5 h-5 text-sky-500" />
            ) : (
              <Square className="w-5 h-5" />
            )}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          {someSelected && (
            <>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {selectedIds.size} selected
              </span>
              <div className="flex-1" />
              <button
                onClick={handleBulkCancel}
                disabled={bulkAction !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkAction === 'cancel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                Cancel Selected
              </button>
              <button
                onClick={handleBulkSendNow}
                disabled={bulkAction !== null}
                className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkAction === 'send' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Now
              </button>
            </>
          )}
        </div>
      )}

      {scheduledMessages.length === 0 ? (
        <div className="card text-center py-12">
          <Clock className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {sourceFilter === 'all' ? 'No Scheduled Messages' :
             sourceFilter === 'manual' ? 'No Manual Scheduled Messages' :
             sourceFilter === 'drip' ? 'No Drip Scheduled Messages' :
             sourceFilter === 'campaign' ? 'No Campaign Scheduled Messages' :
             'No Bulk Scheduled Messages'}
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            {sourceFilter === 'all'
              ? "You don't have any scheduled messages. Schedule a message from the Texts page."
              : `No ${sourceFilter} scheduled messages found. Try selecting a different filter.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduledMessages.map((message) => (
            <div
              key={message.id}
              className={`card hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                selectedIds.has(message.id) ? 'ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-slate-900' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox for pending messages */}
                {message.status === 'pending' && (
                  <button
                    onClick={() => toggleSelect(message.id)}
                    className="mt-1 text-slate-400 hover:text-sky-500 transition-colors"
                  >
                    {selectedIds.has(message.id) ? (
                      <CheckSquare className="w-5 h-5 text-sky-500" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(message.status)}`}>
                      {message.status.toUpperCase()}
                    </div>
                    {/* Source badge */}
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      message.source === 'drip' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                      message.source === 'campaign' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      message.source === 'bulk' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {message.source === 'drip' ? 'Drip' :
                       message.source === 'campaign' ? 'Campaign' :
                       message.source === 'bulk' ? 'Bulk' : 'Manual'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <User className="w-4 h-4" />
                      <span>
                        {message.leads?.first_name} {message.leads?.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Phone className="w-4 h-4" />
                      <span>{message.leads?.phone}</span>
                    </div>
                  </div>

                  <p className="text-slate-900 dark:text-slate-100 mb-3 line-clamp-2">{message.body}</p>

                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {new Date(message.scheduled_for).toLocaleString()} ({getTimeUntil(message.scheduled_for)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      <span>{message.credits_cost} credits</span>
                    </div>
                  </div>
                </div>

                {message.status === 'pending' && (
                  <button
                    onClick={() => cancelMessage(message.id)}
                    disabled={cancelling === message.id}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling === message.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

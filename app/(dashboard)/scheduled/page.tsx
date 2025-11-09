"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
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
  leads?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
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
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  useEffect(() => {
    fetchScheduledMessages();
  }, []);

  async function fetchScheduledMessages() {
    try {
      const response = await fetch('/api/messages/schedule');
      const data = await response.json();

      if (data.ok) {
        setScheduledMessages(data.scheduledMessages);
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
            // Remove from list
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

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'sent': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'failed': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'cancelled': return 'text-[#5a6b7f] bg-gray-500/10 border-gray-500/20';
      default: return 'text-white/60 bg-white/5 border-white/10';
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
        <h1 className="text-2xl font-semibold text-white">Scheduled Messages</h1>
        <div className="card">
          <p className="text-white/60">Loading...</p>
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
          <h1 className="text-2xl font-semibold text-white">Scheduled Messages</h1>
          <p className="text-sm text-white/60 mt-1">
            View and manage your scheduled messages
          </p>
        </div>
        <button
          onClick={fetchScheduledMessages}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {scheduledMessages.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-white mb-2">No Scheduled Messages</h3>
          <p className="text-white/60">
            You don't have any scheduled messages. Schedule a message from the Texts page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduledMessages.map((message) => (
            <div key={message.id} className="card hover:bg-white/[0.07] transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(message.status)}`}>
                      {message.status.toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>
                        {message.leads?.first_name} {message.leads?.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>{message.leads?.phone}</span>
                    </div>
                  </div>

                  <p className="text-white mb-3 line-clamp-2">{message.body}</p>

                  <div className="flex items-center gap-4 text-sm text-white/60">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        {new Date(message.scheduled_for).toLocaleString()} ({getTimeUntil(message.scheduled_for)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
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

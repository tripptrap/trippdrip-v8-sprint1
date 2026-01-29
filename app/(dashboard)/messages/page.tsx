'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Send, Phone, User, Clock, Search, Plus, X, Users, Megaphone, Sparkles, Zap, Calendar, CheckCircle, XCircle, Timer, Pencil, Trash2, Save } from 'lucide-react';
import SendSMSModal from '@/components/SendSMSModal';
import AIDripModal from '@/components/AIDripModal';

// Helper function to guess timezone from phone number area code
function getTimezoneFromPhone(phone: string | undefined): string {
  if (!phone) return '';

  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.substring(cleaned.length - 10, cleaned.length - 7) : '';

  const timezoneMap: { [key: string]: string } = {
    '212': 'ET', '646': 'ET', '917': 'ET', '347': 'ET', '305': 'ET', '786': 'ET', '954': 'ET',
    '404': 'ET', '678': 'ET', '770': 'ET', '617': 'ET', '857': 'ET', '202': 'ET', '215': 'ET',
    '267': 'ET', '407': 'ET', '321': 'ET', '704': 'ET', '980': 'ET',
    '312': 'CT', '773': 'CT', '872': 'CT', '713': 'CT', '281': 'CT', '832': 'CT', '214': 'CT',
    '469': 'CT', '972': 'CT', '210': 'CT', '726': 'CT', '512': 'CT', '737': 'CT', '314': 'CT',
    '504': 'CT', '615': 'CT', '629': 'CT',
    '303': 'MT', '720': 'MT', '602': 'MT', '623': 'MT', '480': 'MT', '505': 'MT', '801': 'MT', '385': 'MT',
    '213': 'PT', '310': 'PT', '323': 'PT', '424': 'PT', '818': 'PT', '415': 'PT', '628': 'PT',
    '619': 'PT', '858': 'PT', '206': 'PT', '253': 'PT', '503': 'PT', '971': 'PT', '702': 'PT',
  };

  return timezoneMap[areaCode] || '';
}

function getCurrentTimeInTimezone(timezone: string): string {
  if (!timezone) return '';
  try {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${timeString} ${timezone}`;
  } catch (e) {
    return '';
  }
}

interface Thread {
  id: string;
  phone_number: string;
  channel: string;
  last_message: string;
  updated_at: string;
  messages_from_user?: number;
  messages_from_lead?: number;
  status: string;
  campaign_id?: string;
  campaigns?: {
    id: string;
    name: string;
  } | null;
  leads?: {
    id: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    state?: string;
    zip_code?: string;
    status?: string;
    tags?: string[];
  } | null;
}

interface Message {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  direction: 'inbound' | 'outbound' | 'in' | 'out';
  status: string;
  created_at: string;
  media_urls?: string[];
  num_media?: number;
}

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
}

// Component that handles search params (must be wrapped in Suspense)
function MessagesSearchParamsHandler({
  onParamsLoaded
}: {
  onParamsLoaded: (phone: string | null, name: string | null) => void
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    onParamsLoaded(phone, name);
  }, [searchParams, onParamsLoaded]);

  return null;
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalPhone, setSendModalPhone] = useState('');
  const [sendModalName, setSendModalName] = useState('');

  // View toggle: 'conversations' (default) or 'campaign_only'
  const [viewMode, setViewMode] = useState<'conversations' | 'campaign_only'>('conversations');
  const [campaignRecipientCount, setCampaignRecipientCount] = useState(0);

  // Lead selector state
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // AI reply state
  const [generateAIResponse, setGenerateAIResponse] = useState(false);
  const [aiContextMessage, setAiContextMessage] = useState('');

  // AI Drip state
  const [showDripModal, setShowDripModal] = useState(false);
  const [activeDripStatus, setActiveDripStatus] = useState<{ active: boolean; messagesSent?: number } | null>(null);
  const [scheduledDripMessages, setScheduledDripMessages] = useState<{
    id: string;
    messageNumber: number;
    content: string;
    scheduledFor: string;
    status: string;
    sentAt?: string;
  }[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState<string | null>(null);

  // Handler for search params - memoized to prevent infinite loops
  const handleSearchParams = useCallback((phone: string | null, name: string | null) => {
    if (phone) {
      setSendModalPhone(phone);
      setSendModalName(name || '');
      setShowSendModal(true);
    }
  }, []);

  // Load threads when viewMode changes
  useEffect(() => {
    loadThreads();
  }, [viewMode]);

  // Load messages when thread selected
  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
      checkDripStatus(selectedThread.id);
    } else {
      setActiveDripStatus(null);
      setScheduledDripMessages([]);
    }
  }, [selectedThread]);

  // Check if there's an active drip for the selected thread
  const checkDripStatus = async (threadId: string) => {
    try {
      const response = await fetch(`/api/ai-drip/status?threadId=${threadId}`);
      const data = await response.json();
      if (data.success) {
        setActiveDripStatus({
          active: data.active,
          messagesSent: data.drip?.messagesSent,
        });
        setScheduledDripMessages(data.scheduledMessages || []);
      } else {
        setScheduledDripMessages([]);
      }
    } catch (err) {
      console.error('Error checking drip status:', err);
      setScheduledDripMessages([]);
    }
  };

  // Edit a scheduled drip message
  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
  };

  // Save edited drip message
  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      const response = await fetch('/api/ai-drip/message', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: editContent.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        // Update local state
        setScheduledDripMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, content: editContent.trim() } : m)
        );
        setEditingMessageId(null);
        setEditContent('');
      } else {
        alert(data.error || 'Failed to save message');
      }
    } catch (err) {
      console.error('Error saving edit:', err);
      alert('Failed to save message');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete a scheduled drip message
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled message?')) return;
    setDeletingMessage(messageId);
    try {
      const response = await fetch(`/api/ai-drip/message?messageId=${messageId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        // Update local state - mark as cancelled
        setScheduledDripMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, status: 'cancelled' } : m)
        );
        // Refresh drip status
        if (selectedThread) {
          checkDripStatus(selectedThread.id);
        }
      } else {
        alert(data.error || 'Failed to delete message');
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      alert('Failed to delete message');
    } finally {
      setDeletingMessage(null);
    }
  };

  // Delete entire drip
  const handleDeleteDrip = async () => {
    if (!selectedThread) return;
    if (!confirm('Are you sure you want to stop this drip and cancel all remaining messages?')) return;

    try {
      const response = await fetch('/api/ai-drip/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selectedThread.id }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh drip status
        checkDripStatus(selectedThread.id);
      } else {
        alert(data.error || 'Failed to stop drip');
      }
    } catch (err) {
      console.error('Error stopping drip:', err);
      alert('Failed to stop drip');
    }
  };

  // Auto-refresh: Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Refresh threads list silently (without loading spinner)
      loadThreads(true);
      // Refresh current thread messages if one is selected
      if (selectedThread) {
        loadMessages(selectedThread.id, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedThread, viewMode]);

  const loadThreads = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      // Check if demo mode is active
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        // Use demo data
        const { getDemoConversations } = await import('@/lib/demoData');
        const demoConversations = getDemoConversations();

        // Transform demo conversations to thread format
        const demoThreads = demoConversations.map((conv: any) => ({
          id: conv.id,
          lead_id: conv.lead_id,
          lead_name: conv.lead_name || `Lead ${conv.lead_id.split('-')[2]}`,
          lead_phone: '+1234567890',
          phone_number: '+1234567890',
          channel: 'sms' as const,
          last_message: conv.messages[conv.messages.length - 1]?.body || '',
          last_message_at: conv.messages[conv.messages.length - 1]?.created_at || new Date().toISOString(),
          updated_at: conv.messages[conv.messages.length - 1]?.created_at || new Date().toISOString(),
          status: 'active' as const,
          unread_count: 0,
        }));

        setThreads(demoThreads);

        // Auto-select first thread
        if (demoThreads.length > 0 && !selectedThread) {
          setSelectedThread(demoThreads[0]);
        }
      } else {
        // Fetch real data with view filter
        const response = await fetch(`/api/messages/threads?view=${viewMode}`);
        const data = await response.json();

        if (data.success) {
          setThreads(data.threads || []);
          // Auto-select first thread
          if (data.threads && data.threads.length > 0 && !selectedThread) {
            setSelectedThread(data.threads[0]);
          }
        }

        // Also fetch campaign recipient count for the badge
        if (viewMode === 'conversations') {
          const countResponse = await fetch('/api/messages/threads?view=campaign_only');
          const countData = await countResponse.json();
          if (countData.success) {
            setCampaignRecipientCount(countData.filteredCount || 0);
          }
        }
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (threadId: string, silent = false) => {
    try {
      if (!silent) setLoadingMessages(true);

      // Check if demo mode is active
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        // Use demo data
        const { getDemoConversations } = await import('@/lib/demoData');
        const demoConversations = getDemoConversations();

        // Find the conversation for this thread
        const conversation = demoConversations.find((conv: any) => conv.id === threadId);

        if (conversation) {
          setMessages(conversation.messages || []);
        } else {
          setMessages([]);
        }
      } else {
        // Fetch real data
        const response = await fetch(`/api/messages/threads/${threadId}`);
        const data = await response.json();

        if (data.success) {
          setMessages(data.messages || []);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleNewMessage = async () => {
    setShowLeadSelector(true);
    setLeadSearchQuery('');
    await loadLeads();
  };

  const loadLeads = async () => {
    try {
      setLoadingLeads(true);
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        // Filter to only leads with phone numbers
        setLeads(data.items.filter((l: Lead) => l.phone));
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleSelectLead = (lead: Lead) => {
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
    setSendModalPhone(lead.phone || '');
    setSendModalName(name);
    setShowLeadSelector(false);
    setShowSendModal(true);
  };

  const handleEnterManually = () => {
    setSendModalPhone('');
    setSendModalName('');
    setShowLeadSelector(false);
    setShowSendModal(true);
  };

  const handleThreadClick = (thread: Thread) => {
    setSelectedThread(thread);
  };

  const handleSendToThread = () => {
    if (selectedThread) {
      setSendModalPhone(selectedThread.phone_number);
      setGenerateAIResponse(false);
      setAiContextMessage('');
      setShowSendModal(true);
    }
  };

  // Handle AI reply to a specific inbound message
  const handleReplyWithAI = (message: Message) => {
    if (selectedThread) {
      setSendModalPhone(selectedThread.phone_number);
      setAiContextMessage(message.body);
      setGenerateAIResponse(true);
      setShowSendModal(true);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredThreads = threads.filter(thread =>
    thread.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Search params handler wrapped in Suspense */}
      <Suspense fallback={null}>
        <MessagesSearchParamsHandler onParamsLoaded={handleSearchParams} />
      </Suspense>

      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-teal-400" />
            <h1 className="text-2xl font-bold text-white">Messages</h1>
          </div>
          <button
            onClick={handleNewMessage}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Message
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('conversations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'conversations'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Users className="h-4 w-4" />
            Conversations
          </button>
          <button
            onClick={() => setViewMode('campaign_only')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'campaign_only'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Megaphone className="h-4 w-4" />
            Campaign Recipients
            {campaignRecipientCount > 0 && viewMode === 'conversations' && (
              <span className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                {campaignRecipientCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Threads List */}
        <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Threads */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-slate-400">Loading conversations...</div>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                {viewMode === 'campaign_only' ? (
                  <>
                    <Megaphone className="h-12 w-12 text-slate-500 mb-3" />
                    <p className="text-slate-400 mb-2">No campaign recipients</p>
                    <p className="text-sm text-slate-500">Campaign messages that haven't received replies will appear here</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-12 w-12 text-slate-500 mb-3" />
                    <p className="text-slate-400 mb-2">No conversations yet</p>
                    <p className="text-sm text-slate-500">Send your first message to get started</p>
                  </>
                )}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                // Get display name from lead or fallback to phone number
                const leadName = thread.leads
                  ? [thread.leads.first_name, thread.leads.last_name].filter(Boolean).join(' ')
                  : null;
                const displayName = leadName || formatPhoneNumber(thread.phone_number || thread.leads?.phone || '');

                return (
                  <button
                    key={thread.id}
                    onClick={() => handleThreadClick(thread)}
                    className={`w-full p-4 border-b border-slate-700 hover:bg-slate-700 transition-colors text-left ${
                      selectedThread?.id === thread.id ? 'bg-slate-700' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        thread.campaign_id ? 'bg-orange-500/20' : 'bg-teal-500/20'
                      }`}>
                        {thread.campaign_id ? (
                          <Megaphone className="h-5 w-5 text-orange-400" />
                        ) : (
                          <User className="h-5 w-5 text-teal-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white text-sm truncate">
                            {displayName}
                          </span>
                          <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                            {formatTimestamp(thread.updated_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 truncate">
                          {thread.last_message || 'No messages yet'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            thread.channel === 'sms' ? 'bg-teal-500/20 text-teal-400' :
                            thread.channel === 'mms' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-600 text-slate-400'
                          }`}>
                            {(thread.channel || 'sms').toUpperCase()}
                          </span>
                          {thread.campaigns && (
                            <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 truncate max-w-[100px]" title={thread.campaigns.name}>
                              {thread.campaigns.name}
                            </span>
                          )}
                          {(thread.messages_from_user || thread.messages_from_lead) && (
                            <span className="text-xs text-slate-500">
                              {(thread.messages_from_user || 0) + (thread.messages_from_lead || 0)} msgs
                            </span>
                          )}
                          {thread.messages_from_lead && thread.messages_from_lead > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                              {thread.messages_from_lead} replies
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div className="flex-1 flex flex-col bg-slate-900">
          {selectedThread ? (
            <>
              {/* Conversation Header */}
              <div className="bg-slate-800 border-b border-slate-700 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-teal-400" />
                    </div>
                    <div>
                      {/* Client Name & State */}
                      {selectedThread.leads && (selectedThread.leads.first_name || selectedThread.leads.last_name) && (
                        <h2 className="font-semibold text-white">
                          {[selectedThread.leads.first_name, selectedThread.leads.last_name].filter(Boolean).join(' ')}
                          {selectedThread.leads.state && (
                            <span className="text-slate-400 font-normal ml-2">({selectedThread.leads.state})</span>
                          )}
                        </h2>
                      )}
                      {/* Phone Number */}
                      <div className={`${selectedThread.leads?.first_name ? 'text-sm text-slate-400' : 'font-semibold text-white'}`}>
                        {formatPhoneNumber(selectedThread.phone_number)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>{selectedThread.channel.toUpperCase()}</span>
                        {(() => {
                          const timezone = getTimezoneFromPhone(selectedThread.phone_number);
                          const currentTime = getCurrentTimeInTimezone(timezone);
                          return currentTime ? (
                            <>
                              <span>•</span>
                              <span className="text-teal-400" title="Lead's local time">🕐 {currentTime}</span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    {/* Lead Details - Email, Tags, Zip */}
                    {selectedThread.leads && (
                      <div className="ml-4 pl-4 border-l border-slate-700 flex flex-wrap items-center gap-3 text-sm">
                        {selectedThread.leads.email && (
                          <span className="text-slate-400" title="Email">
                            ✉️ {selectedThread.leads.email}
                          </span>
                        )}
                        {selectedThread.leads.zip_code && (
                          <span className="text-slate-400" title="Zip Code">
                            📍 {selectedThread.leads.zip_code}
                          </span>
                        )}
                        {selectedThread.leads.status && (
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            selectedThread.leads.status === 'new' ? 'bg-blue-500/20 text-blue-400' :
                            selectedThread.leads.status === 'contacted' ? 'bg-yellow-500/20 text-yellow-400' :
                            selectedThread.leads.status === 'qualified' ? 'bg-green-500/20 text-green-400' :
                            selectedThread.leads.status === 'converted' ? 'bg-teal-500/20 text-teal-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {selectedThread.leads.status}
                          </span>
                        )}
                        {selectedThread.leads.tags && selectedThread.leads.tags.length > 0 && (
                          <div className="flex gap-1">
                            {selectedThread.leads.tags.slice(0, 3).map((tag: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                                {tag}
                              </span>
                            ))}
                            {selectedThread.leads.tags.length > 3 && (
                              <span className="text-slate-500 text-xs">+{selectedThread.leads.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Call"
                    >
                      <Phone className="h-5 w-5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => {
                        if (selectedThread) {
                          setSendModalPhone(selectedThread.phone_number);
                          // Get the last inbound message for context
                          const lastInbound = messages.filter(m =>
                            m.direction === 'inbound' || m.direction === 'in'
                          ).pop();
                          setAiContextMessage(lastInbound?.body || '');
                          setGenerateAIResponse(true);
                          setShowSendModal(true);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
                      title="Generate AI Reply"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Reply
                    </button>
                    <button
                      onClick={() => setShowDripModal(true)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        activeDripStatus?.active
                          ? 'bg-amber-500 hover:bg-amber-600 text-white'
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/50'
                      }`}
                      title={activeDripStatus?.active ? 'AI Drip Active - Click to manage' : 'Start AI Drip'}
                    >
                      <Zap className={`h-4 w-4 ${activeDripStatus?.active ? 'animate-pulse' : ''}`} />
                      {activeDripStatus?.active ? `Drip (${activeDripStatus.messagesSent || 0})` : 'AI Drip'}
                    </button>
                    <button
                      onClick={handleSendToThread}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                    >
                      <Send className="h-4 w-4" />
                      Send Message
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-slate-400">Loading messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-400">No messages in this conversation</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => {
                      // Handle both direction formats: 'outbound'/'inbound' and 'out'/'in'
                      const isOutbound = message.direction === 'outbound' || message.direction === 'out';

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}
                        >
                          <div className="relative">
                            <div
                              className={`max-w-md rounded-lg p-3 ${
                                isOutbound
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-slate-800 text-white border border-slate-700'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>

                              {/* Media attachments */}
                              {message.media_urls && message.media_urls.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  {message.media_urls.map((url, idx) => (
                                    <div key={idx} className="rounded overflow-hidden">
                                      <img
                                        src={url}
                                        alt={`Media ${idx + 1}`}
                                        className="max-w-full h-auto"
                                        onError={(e) => {
                                          // If image fails to load, show link instead
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs underline opacity-75 hover:opacity-100"
                                      >
                                        View media
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs opacity-75">
                                  {formatTimestamp(message.created_at)}
                                </span>
                                {isOutbound && message.status && (
                                  <span className="text-xs opacity-75">
                                    • {message.status}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Reply with AI button - shows on hover for inbound messages */}
                            {!isOutbound && (
                              <button
                                onClick={() => handleReplyWithAI(message)}
                                className="absolute -right-12 top-1/2 -translate-y-1/2 p-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                                title="Reply with AI"
                              >
                                <Sparkles className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Scheduled Drip Messages Preview */}
                    {scheduledDripMessages.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-slate-700/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                              <Zap className="h-3 w-3 text-amber-400" />
                            </div>
                            <span className="text-sm font-medium text-amber-400">Scheduled AI Drip Messages</span>
                            <span className="text-xs text-slate-500">
                              ({scheduledDripMessages.filter(m => m.status === 'scheduled').length} pending)
                            </span>
                          </div>
                          {scheduledDripMessages.some(m => m.status === 'scheduled') ? (
                            <button
                              onClick={handleDeleteDrip}
                              className="text-xs px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                            >
                              Stop Drip
                            </button>
                          ) : scheduledDripMessages.some(m => m.status === 'cancelled') ? (
                            <button
                              onClick={async () => {
                                // Delete cancelled messages from database
                                const cancelledIds = scheduledDripMessages
                                  .filter(m => m.status === 'cancelled')
                                  .map(m => m.id);

                                for (const id of cancelledIds) {
                                  await fetch(`/api/ai-drip/message?messageId=${id}&permanent=true`, {
                                    method: 'DELETE',
                                  });
                                }
                                setScheduledDripMessages([]);
                              }}
                              className="text-xs px-2 py-1 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
                            >
                              Clear All
                            </button>
                          ) : null}
                        </div>

                        <div className="space-y-3">
                          {scheduledDripMessages.map((dripMsg) => {
                            const scheduledDate = new Date(dripMsg.scheduledFor);
                            const isSent = dripMsg.status === 'sent';
                            const isCancelled = dripMsg.status === 'cancelled';
                            const isFailed = dripMsg.status === 'failed';
                            const isScheduled = dripMsg.status === 'scheduled';
                            const isEditing = editingMessageId === dripMsg.id;

                            return (
                              <div
                                key={dripMsg.id}
                                className={`flex justify-end`}
                              >
                                <div className={`max-w-md w-full rounded-lg p-3 border ${
                                  isSent
                                    ? 'bg-teal-600/30 border-teal-500/30'
                                    : isCancelled
                                    ? 'bg-slate-700/30 border-slate-600/30 opacity-50'
                                    : isFailed
                                    ? 'bg-red-500/10 border-red-500/30'
                                    : 'bg-amber-500/10 border-amber-500/30 border-dashed'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                      isSent
                                        ? 'bg-teal-500/20 text-teal-400'
                                        : isCancelled
                                        ? 'bg-slate-600/20 text-slate-400'
                                        : isFailed
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                      {isSent ? (
                                        <span className="flex items-center gap-1">
                                          <CheckCircle className="h-3 w-3" /> Sent
                                        </span>
                                      ) : isCancelled ? (
                                        <span className="flex items-center gap-1">
                                          <XCircle className="h-3 w-3" /> Cancelled
                                        </span>
                                      ) : isFailed ? (
                                        <span className="flex items-center gap-1">
                                          <XCircle className="h-3 w-3" /> Failed
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1">
                                          <Timer className="h-3 w-3" /> #{dripMsg.messageNumber} Scheduled
                                        </span>
                                      )}
                                    </span>
                                    {/* Edit/Delete buttons for scheduled messages */}
                                    {isScheduled && !isEditing && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleEditMessage(dripMsg.id, dripMsg.content)}
                                          className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                                          title="Edit message"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteMessage(dripMsg.id)}
                                          disabled={deletingMessage === dripMsg.id}
                                          className="p-1 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                                          title="Cancel message"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Edit form or message content */}
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-amber-500/50 rounded text-white resize-none focus:outline-none focus:border-amber-400"
                                        rows={3}
                                        maxLength={320}
                                      />
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500">{editContent.length}/320</span>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => {
                                              setEditingMessageId(null);
                                              setEditContent('');
                                            }}
                                            className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => handleSaveEdit(dripMsg.id)}
                                            disabled={savingEdit || !editContent.trim()}
                                            className="px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50 flex items-center gap-1"
                                          >
                                            <Save className="h-3 w-3" />
                                            {savingEdit ? 'Saving...' : 'Save'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className={`text-sm whitespace-pre-wrap break-words ${
                                      isCancelled ? 'text-slate-500 line-through' : 'text-white'
                                    }`}>
                                      {dripMsg.content}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-2 mt-2 text-xs">
                                    <Calendar className="h-3 w-3 text-slate-400" />
                                    <span className={isSent ? 'text-teal-400' : isCancelled ? 'text-slate-500' : 'text-amber-400'}>
                                      {isSent && dripMsg.sentAt
                                        ? `Sent ${new Date(dripMsg.sentAt).toLocaleString()}`
                                        : scheduledDate.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">
                  Select a conversation
                </h3>
                <p className="text-slate-500">
                  Choose a conversation from the list or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lead Selector Modal */}
      {showLeadSelector && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-700 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Select Recipient</h2>
              <button
                onClick={() => setShowLeadSelector(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            {/* Lead List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loadingLeads ? (
                <div className="text-center py-8 text-slate-400">Loading leads...</div>
              ) : leads.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No leads with phone numbers found</div>
              ) : (
                <>
                  {leads
                    .filter(lead => {
                      if (!leadSearchQuery) return true;
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').toLowerCase();
                      const phone = lead.phone?.toLowerCase() || '';
                      const query = leadSearchQuery.toLowerCase();
                      return name.includes(query) || phone.includes(query);
                    })
                    .map(lead => {
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
                      return (
                        <button
                          key={lead.id}
                          onClick={() => handleSelectLead(lead)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700 transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-semibold">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">{name}</div>
                            <div className="text-sm text-slate-400 truncate">{lead.phone}</div>
                          </div>
                        </button>
                      );
                    })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700">
              <button
                onClick={handleEnterManually}
                className="w-full py-2.5 text-sm text-teal-400 hover:text-teal-300 transition-colors"
              >
                Or enter phone number manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send SMS Modal */}
      <SendSMSModal
        isOpen={showSendModal}
        onClose={() => {
          setShowSendModal(false);
          setSendModalPhone('');
          setSendModalName('');
          setGenerateAIResponse(false);
          setAiContextMessage('');
        }}
        leadPhone={sendModalPhone}
        leadName={sendModalName}
        leadId={selectedThread?.leads?.id}
        generateAIResponse={generateAIResponse}
        contextMessage={aiContextMessage}
        conversationHistory={messages}
        onSuccess={() => {
          loadThreads();
          if (selectedThread) {
            loadMessages(selectedThread.id);
          }
        }}
      />

      {/* AI Drip Modal */}
      {selectedThread && (
        <AIDripModal
          isOpen={showDripModal}
          onClose={() => setShowDripModal(false)}
          threadId={selectedThread.id}
          phoneNumber={selectedThread.phone_number}
          onSuccess={() => {
            if (selectedThread) {
              checkDripStatus(selectedThread.id);
            }
          }}
        />
      )}
    </div>
  );
}

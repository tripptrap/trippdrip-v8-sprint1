'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Send, Phone, User, Clock, Search, Plus, X } from 'lucide-react';
import SendSMSModal from '@/components/SendSMSModal';

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
}

interface Message {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  direction: 'inbound' | 'outbound';
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

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalPhone, setSendModalPhone] = useState('');
  const [sendModalName, setSendModalName] = useState('');

  // Lead selector state
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // Check URL params and auto-open send modal if phone is provided
  useEffect(() => {
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    if (phone) {
      setSendModalPhone(phone);
      setSendModalName(name || '');
      setShowSendModal(true);
    }
  }, [searchParams]);

  // Load threads
  useEffect(() => {
    loadThreads();
  }, []);

  // Load messages when thread selected
  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    }
  }, [selectedThread]);

  const loadThreads = async () => {
    try {
      setLoading(true);

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
        // Fetch real data
        const response = await fetch('/api/messages/threads');
        const data = await response.json();

        if (data.success) {
          setThreads(data.threads || []);
          // Auto-select first thread
          if (data.threads && data.threads.length > 0 && !selectedThread) {
            setSelectedThread(data.threads[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      setLoadingMessages(true);

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
    <div className="h-screen flex flex-col bg-[#0a0f1a]">
      {/* Header */}
      <div className="bg-[#1a1f2e] border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            <h1 className="text-2xl font-bold text-white">Messages</h1>
          </div>
          <button
            onClick={handleNewMessage}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Message
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Threads List */}
        <div className="w-80 bg-[#1a1f2e] border-r border-white/10 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#0c1420] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Threads */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">Loading conversations...</div>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <MessageSquare className="h-12 w-12 text-gray-600 mb-3" />
                <p className="text-gray-400 mb-2">No conversations yet</p>
                <p className="text-sm text-gray-500">Send your first message to get started</p>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className={`w-full p-4 border-b border-white/5 hover:bg-white/5 transition-colors text-left ${
                    selectedThread?.id === thread.id ? 'bg-white/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white text-sm truncate">
                          {formatPhoneNumber(thread.phone_number)}
                        </span>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {formatTimestamp(thread.updated_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 truncate">
                        {thread.last_message || 'No messages yet'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          thread.channel === 'sms' ? 'bg-emerald-900/20 text-emerald-400' :
                          thread.channel === 'mms' ? 'bg-teal-800/50 text-emerald-400' :
                          'bg-gray-700/50 text-gray-400'
                        }`}>
                          {thread.channel.toUpperCase()}
                        </span>
                        {(thread.messages_from_user || thread.messages_from_lead) && (
                          <span className="text-xs text-gray-500">
                            {(thread.messages_from_user || 0) + (thread.messages_from_lead || 0)} messages
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div className="flex-1 flex flex-col bg-[#0a0f1a]">
          {selectedThread ? (
            <>
              {/* Conversation Header */}
              <div className="bg-[#1a1f2e] border-b border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">
                        {formatPhoneNumber(selectedThread.phone_number)}
                      </h2>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>{selectedThread.channel.toUpperCase()}</span>
                        {(() => {
                          const timezone = getTimezoneFromPhone(selectedThread.phone_number);
                          const currentTime = getCurrentTimeInTimezone(timezone);
                          return currentTime ? (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400" title="Lead's local time">🕐 {currentTime}</span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                      title="Call"
                    >
                      <Phone className="h-5 w-5 text-gray-400" />
                    </button>
                    <button
                      onClick={handleSendToThread}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
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
                    <div className="text-gray-400">Loading messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-400">No messages in this conversation</p>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-lg p-3 ${
                          message.direction === 'outbound'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#1a1f2e] text-gray-200 border border-white/10'
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
                          {message.direction === 'outbound' && (
                            <span className="text-xs opacity-75">
                              • {message.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                  Select a conversation
                </h3>
                <p className="text-gray-500">
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
          <div className="bg-[#1a1f2e] rounded-lg shadow-xl max-w-md w-full border border-white/10 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Select Recipient</h2>
              <button
                onClick={() => setShowLeadSelector(false)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#0c1420] border border-white/20 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Lead List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loadingLeads ? (
                <div className="text-center py-8 text-gray-400">Loading leads...</div>
              ) : leads.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No leads with phone numbers found</div>
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
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">{name}</div>
                            <div className="text-sm text-gray-400 truncate">{lead.phone}</div>
                          </div>
                        </button>
                      );
                    })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={handleEnterManually}
                className="w-full py-2.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
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
        onClose={() => { setShowSendModal(false); setSendModalPhone(''); setSendModalName(''); }}
        leadPhone={sendModalPhone}
        leadName={sendModalName}
        onSuccess={() => {
          loadThreads();
          if (selectedThread) {
            loadMessages(selectedThread.id);
          }
        }}
      />
    </div>
  );
}

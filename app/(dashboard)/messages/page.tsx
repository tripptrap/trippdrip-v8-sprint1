'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Send, Phone, User, Clock, Search, Plus } from 'lucide-react';
import SendSMSModal from '@/components/SendSMSModal';

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

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalPhone, setSendModalPhone] = useState('');

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

  const handleNewMessage = () => {
    setSendModalPhone('');
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
            <MessageSquare className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-bold text-white">Messages</h1>
          </div>
          <button
            onClick={handleNewMessage}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
                className="w-full pl-10 pr-4 py-2 bg-[#0c1420] border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
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
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-blue-400" />
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
                          thread.channel === 'sms' ? 'bg-green-900/20 text-green-400' :
                          thread.channel === 'mms' ? 'bg-purple-900/20 text-purple-400' :
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
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">
                        {formatPhoneNumber(selectedThread.phone_number)}
                      </h2>
                      <p className="text-sm text-gray-400">{selectedThread.channel.toUpperCase()}</p>
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
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
                            ? 'bg-blue-600 text-white'
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

      {/* Send SMS Modal */}
      <SendSMSModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        leadPhone={sendModalPhone}
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

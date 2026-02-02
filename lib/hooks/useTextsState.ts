"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

export interface Thread {
  id: string;
  user_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  phone_number: string;
  channel: 'sms' | 'whatsapp' | 'email';
  last_message: string | null;
  status: string;
  messages_from_user: number;
  messages_from_lead: number;
  updated_at: string;
  created_at: string;
  unread?: boolean;
  contact_type: 'lead' | 'client';
  display_name: string;
  is_archived?: boolean;
  archived_at?: string | null;
  ai_disabled?: boolean;
  conversation_tags?: string[];
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
    converted?: boolean;
  } | null;
  client?: {
    id: string;
    original_lead_id?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  } | null;
  campaigns?: {
    id: string;
    name: string;
  } | null;
}

export interface Message {
  id: string;
  thread_id: string;
  user_id: string;
  lead_id: string | null;
  direction: 'inbound' | 'outbound' | 'in' | 'out';
  body: string;
  content?: string;
  status: string;
  message_sid?: string;
  sender?: string;
  recipient?: string;
  from_phone?: string;
  to_phone?: string;
  media_urls?: string[] | null;
  num_media?: number;
  channel?: string;
  provider?: string;
  created_at: string;
  updated_at?: string;
}

export interface ThreadCounts {
  total: number;
  leads: number;
  clients: number;
}

interface UseTextsStateReturn {
  threads: Thread[];
  messages: Message[];
  activeThread: Thread | null;
  channel: 'sms' | 'whatsapp';
  tab: 'leads' | 'clients';
  searchQuery: string;
  loading: boolean;
  messagesLoading: boolean;
  counts: ThreadCounts;
  showArchived: boolean;
  selectMode: boolean;
  selectedThreadIds: Set<string>;
  setChannel: (c: 'sms' | 'whatsapp') => void;
  setTab: (t: 'leads' | 'clients') => void;
  setSearchQuery: (q: string) => void;
  setShowArchived: (v: boolean) => void;
  setSelectMode: (v: boolean) => void;
  toggleThreadSelection: (id: string) => void;
  selectThread: (thread: Thread | null) => void;
  refreshThreads: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  refreshActiveThread: () => Promise<void>;
  archiveThread: (id: string) => Promise<void>;
  unarchiveThread: (id: string) => Promise<void>;
  bulkArchiveThreads: (ids: string[]) => Promise<void>;
}

function playNotificationSound() {
  try {
    const audio = new Audio('/sounds/notification.wav');
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Fallback to oscillator
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
      } catch (e) {
        // Silent fail
      }
    });
  } catch (e) {
    // Silent fail
  }
}

export function useTextsState(): UseTextsStateReturn {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [tab, setTab] = useState<'leads' | 'clients'>('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [counts, setCounts] = useState<ThreadCounts>({ total: 0, leads: 0, clients: 0 });
  const [showArchived, setShowArchived] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());

  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);
  const activeThreadRef = useRef<Thread | null>(null);

  // Keep ref in sync
  activeThreadRef.current = activeThread;

  const loadThreads = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const params = new URLSearchParams();
      params.set('channel', channel);
      params.set('tab', tab);
      if (searchQuery) params.set('search', searchQuery);
      if (showArchived) params.set('archived', 'true');

      const res = await fetch(`/api/texts/threads?${params}`);
      const data = await res.json();

      if (data.success) {
        setThreads(data.threads || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error('Error loading threads:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [channel, tab, searchQuery, showArchived]);

  const loadMessages = useCallback(async (threadId: string, silent = false) => {
    try {
      if (!silent) setMessagesLoading(true);

      const res = await fetch(`/api/messages/threads/${threadId}`);
      const data = await res.json();

      if (data.success) {
        const newMessages: Message[] = data.messages || [];

        // Check for new inbound messages (notification sound)
        if (initialLoadDoneRef.current && prevMessageIdsRef.current.size > 0) {
          const newInbound = newMessages.filter(
            m => !prevMessageIdsRef.current.has(m.id) &&
              (m.direction === 'inbound' || m.direction === 'in')
          );
          if (newInbound.length > 0) {
            playNotificationSound();
          }
        }

        prevMessageIdsRef.current = new Set(newMessages.map(m => m.id));
        setMessages(newMessages);
        initialLoadDoneRef.current = true;
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    await loadThreads(true);
  }, [loadThreads]);

  const refreshMessages = useCallback(async () => {
    if (activeThreadRef.current) {
      await loadMessages(activeThreadRef.current.id, true);
    }
  }, [loadMessages]);

  // Refresh the active thread's data (e.g. after editing contact info)
  const refreshActiveThread = useCallback(async () => {
    await loadThreads(true);
    // Update the active thread object from the refreshed threads list
    if (activeThreadRef.current) {
      const params = new URLSearchParams();
      params.set('channel', channel);
      params.set('tab', tab);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/texts/threads?${params}`);
      const data = await res.json();
      if (data.success) {
        const updated = (data.threads || []).find(
          (t: Thread) => t.id === activeThreadRef.current?.id
        );
        if (updated) {
          setActiveThread(updated);
        }
      }
    }
  }, [loadThreads, channel, tab, searchQuery]);

  const selectThread = useCallback((thread: Thread | null) => {
    setActiveThread(thread);
    if (thread) {
      prevMessageIdsRef.current = new Set();
      initialLoadDoneRef.current = false;
      loadMessages(thread.id);
    } else {
      setMessages([]);
      prevMessageIdsRef.current = new Set();
    }
  }, [loadMessages]);

  // Initial load + reload on filter changes
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Polling: refresh threads and active conversation every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadThreads(true);
      if (activeThreadRef.current) {
        loadMessages(activeThreadRef.current.id, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loadThreads, loadMessages]);

  // Archive helpers
  const archiveThread = useCallback(async (id: string) => {
    try {
      await fetch('/api/threads/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', threadId: id }),
      });
      if (activeThreadRef.current?.id === id) {
        setActiveThread(null);
        setMessages([]);
      }
      await loadThreads(true);
    } catch (err) {
      console.error('Error archiving thread:', err);
    }
  }, [loadThreads]);

  const unarchiveThread = useCallback(async (id: string) => {
    try {
      await fetch('/api/threads/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive', threadId: id }),
      });
      await loadThreads(true);
    } catch (err) {
      console.error('Error unarchiving thread:', err);
    }
  }, [loadThreads]);

  const bulkArchiveThreads = useCallback(async (ids: string[]) => {
    try {
      await fetch('/api/threads/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_archive', threadIds: ids }),
      });
      if (activeThreadRef.current && ids.includes(activeThreadRef.current.id)) {
        setActiveThread(null);
        setMessages([]);
      }
      setSelectedThreadIds(new Set());
      setSelectMode(false);
      await loadThreads(true);
    } catch (err) {
      console.error('Error bulk archiving threads:', err);
    }
  }, [loadThreads]);

  const toggleThreadSelection = useCallback((id: string) => {
    setSelectedThreadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset select mode when switching tabs/filters
  useEffect(() => {
    setSelectMode(false);
    setSelectedThreadIds(new Set());
  }, [tab, showArchived]);

  // Refresh on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadThreads(true);
        if (activeThreadRef.current) {
          loadMessages(activeThreadRef.current.id, true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadThreads, loadMessages]);

  return {
    threads,
    messages,
    activeThread,
    channel,
    tab,
    searchQuery,
    loading,
    messagesLoading,
    counts,
    showArchived,
    selectMode,
    selectedThreadIds,
    setChannel,
    setTab,
    setSearchQuery,
    setShowArchived,
    setSelectMode,
    toggleThreadSelection,
    selectThread,
    refreshThreads,
    refreshMessages,
    refreshActiveThread,
    archiveThread,
    unarchiveThread,
    bulkArchiveThreads,
  };
}

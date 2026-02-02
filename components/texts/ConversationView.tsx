"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Image as ImageIcon, UserCircle, Archive, Tag, X } from 'lucide-react';
import type { Thread, Message } from '@/lib/hooks/useTextsState';

interface ConvTagItem {
  id: string;
  name: string;
  color: string;
}

interface ConversationViewProps {
  thread: Thread;
  messages: Message[];
  loading: boolean;
  children: React.ReactNode; // Composer slot
  showInfoPanel?: boolean;
  onToggleInfoPanel?: () => void;
  onArchiveThread?: (id: string) => void;
}

function getTimezoneFromPhone(phone: string | undefined): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.substring(cleaned.length - 10, cleaned.length - 7) : '';

  const tzMap: Record<string, string> = {
    '212': 'ET', '646': 'ET', '917': 'ET', '347': 'ET', '305': 'ET', '786': 'ET',
    '954': 'ET', '404': 'ET', '678': 'ET', '770': 'ET', '617': 'ET', '857': 'ET',
    '202': 'ET', '215': 'ET', '267': 'ET', '407': 'ET', '321': 'ET', '704': 'ET',
    '312': 'CT', '773': 'CT', '872': 'CT', '713': 'CT', '281': 'CT', '832': 'CT',
    '214': 'CT', '469': 'CT', '972': 'CT', '210': 'CT', '512': 'CT', '737': 'CT',
    '314': 'CT', '504': 'CT', '615': 'CT', '629': 'CT',
    '303': 'MT', '720': 'MT', '602': 'MT', '623': 'MT', '480': 'MT', '505': 'MT',
    '801': 'MT', '385': 'MT',
    '213': 'PT', '310': 'PT', '323': 'PT', '424': 'PT', '818': 'PT', '415': 'PT',
    '628': 'PT', '619': 'PT', '858': 'PT', '206': 'PT', '253': 'PT', '503': 'PT',
    '971': 'PT', '702': 'PT',
  };

  return tzMap[areaCode] || '';
}

function getCurrentTimeInTimezone(timezone: string): string {
  if (!timezone) return '';
  try {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ` ${timezone}`;
  } catch {
    return '';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'delivered':
      return <CheckCheck className="w-3 h-3" />;
    case 'sent':
    case 'queued':
      return <Check className="w-3 h-3" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    default:
      return <Clock className="w-3 h-3" />;
  }
}

function isInbound(direction: string): boolean {
  return direction === 'inbound' || direction === 'in';
}

export default function ConversationView({ thread, messages, loading, children, showInfoPanel, onToggleInfoPanel, onArchiveThread }: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [convTags, setConvTags] = useState<ConvTagItem[]>([]);
  const [threadTags, setThreadTags] = useState<string[]>(thread.conversation_tags || []);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Sync thread tags when thread changes
  useEffect(() => {
    setThreadTags(thread.conversation_tags || []);
  }, [thread.id, thread.conversation_tags]);

  // Fetch conversation tags when dropdown opens
  useEffect(() => {
    if (!showTagDropdown) return;
    fetch('/api/conversation-tags')
      .then(r => r.json())
      .then(d => { if (d.ok) setConvTags(d.tags || []); })
      .catch(() => {});
  }, [showTagDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showTagDropdown) return;
    const handler = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTagDropdown]);

  async function toggleConvTag(tagName: string) {
    const has = threadTags.includes(tagName);
    const action = has ? 'remove_tag' : 'add_tag';
    const updated = has ? threadTags.filter(t => t !== tagName) : [...threadTags, tagName];
    setThreadTags(updated);
    await fetch('/api/threads/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, threadId: thread.id, tagName }),
    });
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  const phone = thread.leads?.phone || thread.phone_number;
  const timezone = getTimezoneFromPhone(phone);
  const currentTime = getCurrentTimeInTimezone(timezone);
  const isClient = thread.contact_type === 'client';
  const isSold = thread.leads?.converted === true || thread.leads?.status === 'sold';

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {thread.display_name}
              </span>
              {isClient ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                  Client
                </span>
              ) : isSold ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                  Sold
                </span>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-600 border border-sky-200 dark:border-sky-800">
                  Lead
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{phone}</span>
              {currentTime && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                  <span className="text-sky-500">{currentTime}</span>
                </>
              )}
              {thread.channel && thread.channel !== 'sms' && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                  <span className="capitalize">{thread.channel}</span>
                </>
              )}
            </div>
            {/* Conversation tags */}
            {threadTags.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {threadTags.map(tagName => {
                  const tagInfo = convTags.find(t => t.name === tagName);
                  const color = tagInfo?.color || '#3b82f6';
                  return (
                    <span
                      key={tagName}
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* AI Mode Indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              isClient
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 text-emerald-600'
                : 'bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800 text-sky-600'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isClient ? 'bg-emerald-500' : 'bg-sky-500'}`} />
              {isClient ? 'Receptionist AI' : 'Flow AI'}
            </div>
            {/* Info Panel Toggle */}
            {onToggleInfoPanel && (
              <button
                onClick={onToggleInfoPanel}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showInfoPanel
                    ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 border border-sky-200 dark:border-sky-800'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <UserCircle className="w-4 h-4" />
                Info
              </button>
            )}
            {/* Conversation Tag Toggle */}
            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showTagDropdown
                    ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 border border-sky-200 dark:border-sky-800'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Tag className="w-4 h-4" />
                Tags
              </button>
              {showTagDropdown && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5 px-1">Conversation Tags</p>
                  {convTags.length === 0 ? (
                    <p className="text-xs text-slate-400 italic px-1 py-2">No conversation tags yet.</p>
                  ) : (
                    <div className="space-y-0.5">
                      {convTags.map(tag => {
                        const active = threadTags.includes(tag.name);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleConvTag(tag.name)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                              active
                                ? 'bg-sky-50 dark:bg-sky-900/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="flex-1 text-left text-slate-700 dark:text-slate-300">{tag.name}</span>
                            {active && <Check className="w-3.5 h-3.5 text-sky-500" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Archive button */}
            {onArchiveThread && (
              <button
                onClick={() => onArchiveThread(thread.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 border border-slate-200 dark:border-slate-700"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`h-10 rounded-2xl animate-pulse ${
                  i % 2 === 0 ? 'w-48 bg-slate-100 dark:bg-slate-700' : 'w-40 bg-sky-100 dark:bg-sky-900/30'
                }`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-16 h-16 text-slate-200 dark:text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Start the conversation below.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const inbound = isInbound(msg.direction);
            const isFirstOfDay = index === 0 ||
              new Date(messages[index - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();

            return (
              <div key={msg.id}>
                {/* Date separator */}
                {isFirstOfDay && (
                  <div className="flex items-center justify-center my-4">
                    <div className="px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs text-slate-500 dark:text-slate-400">
                      {new Date(msg.created_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: new Date(msg.created_at).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                      })}
                    </div>
                  </div>
                )}

                <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                    inbound
                      ? 'bg-slate-100 dark:bg-slate-700 rounded-bl-md'
                      : 'bg-sky-600 text-white rounded-br-md'
                  }`}>
                    {/* Media attachments */}
                    {msg.media_urls && msg.media_urls.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {msg.media_urls.map((url, i) => (
                          <div key={i} className="rounded-lg overflow-hidden">
                            <img
                              src={url}
                              alt="Attachment"
                              className="max-w-full max-h-48 rounded-lg object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message body */}
                    <div className="break-words whitespace-pre-wrap text-sm">
                      {msg.body || msg.content || ''}
                    </div>

                    {/* Timestamp + status */}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${
                      inbound ? 'text-slate-400 dark:text-slate-500' : 'text-sky-200'
                    }`}>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {!inbound && <StatusIcon status={msg.status} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer (passed as children) */}
      {children}
    </div>
  );
}

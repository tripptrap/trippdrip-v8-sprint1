"use client";

import { useMemo, useState, useEffect } from 'react';
import { Search, Tag, X } from 'lucide-react';
import type { Thread, ThreadCounts } from '@/lib/hooks/useTextsState';

interface TagItem {
  id: string;
  name: string;
  color: string;
  lead_count?: number;
}

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (thread: Thread) => void;
  tab: 'leads' | 'clients';
  onTabChange: (tab: 'leads' | 'clients') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  counts: ThreadCounts;
  loading: boolean;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

export default function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  tab,
  onTabChange,
  searchQuery,
  onSearchChange,
  counts,
  loading,
}: ThreadListProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);

  // Fetch tags from the tags table
  useEffect(() => {
    if (tab !== 'leads') return;
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        if (data.ok && Array.isArray(data.items)) {
          setAvailableTags(data.items);
        }
      })
      .catch(() => {});
  }, [tab]);

  // Merge: tags from the tags table + any tags found on threads
  const allTags = useMemo(() => {
    const tagMap = new Map<string, { name: string; color: string }>();

    // Add tags from the tags table first
    availableTags.forEach(t => {
      tagMap.set(t.name, { name: t.name, color: t.color });
    });

    // Also pick up any tags from thread leads (in case they aren't in the tags table)
    if (tab === 'leads') {
      threads.forEach(t => {
        const tags = t.leads?.tags;
        if (Array.isArray(tags)) {
          tags.forEach(tag => {
            if (tag && typeof tag === 'string' && !tagMap.has(tag)) {
              tagMap.set(tag, { name: tag, color: '#3b82f6' });
            }
          });
        }
      });
    }

    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableTags, threads, tab]);

  // Filter threads by selected tag
  const filteredThreads = useMemo(() => {
    if (!selectedTag) return threads;
    return threads.filter(t => {
      const tags = t.leads?.tags;
      return Array.isArray(tags) && tags.includes(selectedTag);
    });
  }, [threads, selectedTag]);

  // Reset tag filter when switching tabs
  const handleTabChange = (newTab: 'leads' | 'clients') => {
    setSelectedTag(null);
    onTabChange(newTab);
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 flex flex-col h-[calc(100vh-12rem)]">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => handleTabChange('leads')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'leads'
              ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/50 dark:bg-sky-900/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Leads
          <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'leads'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
          }`}>
            {counts.leads}
          </span>
        </button>
        <button
          onClick={() => handleTabChange('clients')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'clients'
              ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/50 dark:bg-sky-900/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Clients
          <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'clients'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
          }`}>
            {counts.clients}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>
      </div>

      {/* Tag filter (leads tab only) */}
      {tab === 'leads' && (
        <div className="px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5 overflow-x-auto">
          <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {allTags.length === 0 ? (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">No tags yet — create tags to filter leads</span>
          ) : (
            <>
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors shrink-0"
                >
                  Clear
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              {allTags.map(tag => (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors shrink-0 ${
                    selectedTag === tag.name
                      ? 'text-white'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedTag === tag.name ? tag.color : `${tag.color}20`,
                    color: selectedTag === tag.name ? '#fff' : tag.color,
                    border: `1px solid ${tag.color}40`,
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Thread rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
        {loading && threads.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-40 bg-slate-100 dark:bg-slate-700/50 rounded" />
                </div>
              </div>
            </div>
          ))
        ) : filteredThreads.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedTag
                ? `No conversations with tag "${selectedTag}".`
                : `No ${tab === 'leads' ? 'lead' : 'client'} conversations yet.`}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {selectedTag
                ? 'Try a different tag or clear the filter.'
                : tab === 'leads'
                  ? 'Import leads and send your first message to get started.'
                  : 'Mark leads as sold to create client conversations.'}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const active = thread.id === activeThreadId;
            const isClient = thread.contact_type === 'client';
            const leadTags = thread.leads?.tags;
            return (
              <button
                key={thread.id}
                className={`w-full text-left px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                  active ? 'bg-sky-50 dark:bg-sky-900/15 border-l-2 border-sky-500' : ''
                }`}
                onClick={() => onSelectThread(thread)}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${
                    isClient
                      ? 'bg-gradient-to-br from-emerald-400 to-emerald-600'
                      : 'bg-gradient-to-br from-sky-400 to-sky-600'
                  }`}>
                    {getInitials(thread.display_name)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                          {thread.display_name}
                        </span>
                        {isClient && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800 shrink-0">
                            Client
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                        {relativeTime(thread.updated_at)}
                      </span>
                    </div>

                    {/* Tags row (leads only) */}
                    {!isClient && Array.isArray(leadTags) && leadTags.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                        {leadTags.slice(0, 3).map((tag, i) => {
                          const tagInfo = allTags.find(t => t.name === tag);
                          const color = tagInfo?.color || '#3b82f6';
                          return (
                            <span
                              key={i}
                              className="text-[9px] font-medium px-1.5 py-0 rounded-full truncate max-w-[80px]"
                              style={{
                                backgroundColor: `${color}20`,
                                color: color,
                              }}
                            >
                              {tag}
                            </span>
                          );
                        })}
                        {leadTags.length > 3 && (
                          <span className="text-[9px] text-slate-400 dark:text-slate-500">
                            +{leadTags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {thread.last_message || thread.phone_number}
                      </p>
                      {thread.messages_from_lead > 0 && thread.unread && (
                        <span className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center shrink-0 ml-2">
                          <span className="text-[10px] font-bold text-white">!</span>
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
  );
}

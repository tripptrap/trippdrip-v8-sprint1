"use client";

import { useState, useMemo, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useTextsState } from '@/lib/hooks/useTextsState';
import type { Thread } from '@/lib/hooks/useTextsState';
import ThreadList from './ThreadList';
import ConversationView from './ConversationView';
import Composer from './Composer';
import ContactInfoPanel from './ContactInfoPanel';
import SessionsPanel from './SessionsPanel';
import SendSMSModal from '@/components/SendSMSModal';
import toast from 'react-hot-toast';

interface TextsLayoutProps {
  optOutKeyword: string;
}

export default function TextsLayout({ optOutKeyword }: TextsLayoutProps) {
  const {
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
  } = useTextsState();

  const [showSendModal, setShowSendModal] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showSessionsPanel, setShowSessionsPanel] = useState(false);
  const [flowAiActive, setFlowAiActive] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('flowAiActive') === 'true';
    return false;
  });
  const [receptionistActive, setReceptionistActive] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('receptionistActive') === 'true';
    return false;
  });

  // Listen for AI toggles from Topbar
  useEffect(() => {
    const handleAiToggle = (e: any) => {
      if (e.detail.type === 'flow') setFlowAiActive(e.detail.active);
      if (e.detail.type === 'receptionist') setReceptionistActive(e.detail.active);
    };
    window.addEventListener('aiToggled', handleAiToggle);
    return () => window.removeEventListener('aiToggled', handleAiToggle);
  }, []);

  async function handleToggleFlowAI(enable: boolean) {
    setFlowAiActive(enable);
    try {
      await fetch('/api/threads/bulk-ai-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, disable: !enable, contactType: 'lead' }),
      });
      localStorage.setItem('flowAiActive', String(enable));
      toast.success(`AI Flow ${enable ? 'enabled' : 'disabled'} for all leads`);
      window.dispatchEvent(new CustomEvent('aiToggled', { detail: { type: 'flow', active: enable } }));
    } catch {
      setFlowAiActive(!enable);
      toast.error('Failed to toggle AI Flow');
    }
  }

  async function handleToggleReceptionist(enable: boolean) {
    setReceptionistActive(enable);
    try {
      await fetch('/api/threads/bulk-ai-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, disable: !enable, contactType: 'client' }),
      });
      localStorage.setItem('receptionistActive', String(enable));
      toast.success(`Receptionist ${enable ? 'enabled' : 'disabled'} for all clients`);
      window.dispatchEvent(new CustomEvent('aiToggled', { detail: { type: 'receptionist', active: enable } }));
    } catch {
      setReceptionistActive(!enable);
      toast.error('Failed to toggle Receptionist');
    }
  }

  // Determine if this is the first outbound message in the active thread
  const isFirstMessage = useMemo(() => {
    if (!activeThread) return true;
    const outbound = messages.filter(m => m.direction === 'outbound' || m.direction === 'out');
    return outbound.length === 0;
  }, [activeThread, messages]);

  async function handleSendMessage(body: string, options?: { mediaUrls?: string[]; scheduledFor?: string }) {
    if (!activeThread) return;

    const phone = activeThread.phone_number;
    const leadId = activeThread.lead_id || activeThread.leads?.id;

    if (options?.scheduledFor) {
      try {
        const res = await fetch('/api/messages/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId,
            body,
            scheduledFor: options.scheduledFor,
            channel: 'sms',
          }),
        });
        const data = await res.json();
        if (!data.ok && !data.success) {
          throw new Error(data.error || 'Failed to schedule message');
        }
      } catch (err: any) {
        throw err;
      }
      return;
    }

    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          toPhone: phone,
          messageBody: body,
          channel: 'sms',
          mediaUrls: options?.mediaUrls,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.on_dnc_list) {
          throw new Error('This contact is on the Do Not Call list');
        }
        throw new Error(data.error || 'Failed to send message');
      }

      await Promise.all([refreshMessages(), refreshThreads()]);
    } catch (err: any) {
      throw err;
    }
  }

  function handleArchiveFromConversation(threadId: string) {
    archiveThread(threadId);
    toast.success('Conversation archived');
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Texts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your text conversations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSendModal(true)}
            className="px-4 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2 font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            New Message
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Thread list */}
        <div className="col-span-12 md:col-span-5">
          <ThreadList
            threads={threads}
            activeThreadId={activeThread?.id || null}
            onSelectThread={selectThread}
            tab={tab}
            onTabChange={setTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            counts={counts}
            loading={loading}
            showArchived={showArchived}
            onToggleArchived={setShowArchived}
            selectMode={selectMode}
            onToggleSelectMode={setSelectMode}
            selectedThreadIds={selectedThreadIds}
            onToggleThreadSelection={toggleThreadSelection}
            onArchiveThread={(id) => { archiveThread(id); toast.success('Archived'); }}
            onUnarchiveThread={(id) => { unarchiveThread(id); toast.success('Unarchived'); }}
            onBulkArchive={(ids) => { bulkArchiveThreads(ids); toast.success(`${ids.length} conversations archived`); }}
            flowAiActive={flowAiActive}
            receptionistActive={receptionistActive}
            onToggleFlowAI={handleToggleFlowAI}
            onToggleReceptionist={handleToggleReceptionist}
            onBulkToggleAI={async (ids, disable) => {
              try {
                const isAll = ids.length === 0;
                const res = await fetch('/api/threads/bulk-ai-toggle', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(isAll ? { all: true, disable } : { threadIds: ids, disable }),
                });
                const data = await res.json();
                if (data.ok) {
                  toast.success(`AI ${disable ? 'disabled' : 'enabled'} for ${data.updated || 'all'} conversation(s)`);
                  setSelectMode(false);
                }
              } catch {
                toast.error('Failed to toggle AI');
              }
            }}
          />
        </div>

        {/* Right: Conversation + Panels */}
        <div className="col-span-12 md:col-span-7 flex gap-0">
          {!activeThread ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 h-[calc(100vh-12rem)] flex items-center justify-center flex-1">
              <div className="text-center">
                {threads.length === 0 ? (
                  <>
                    <svg className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-slate-500 dark:text-slate-400 mb-2">No conversations yet</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      Import leads and send your first message to get started.
                    </p>
                  </>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                    <p className="text-slate-500 dark:text-slate-400">Select a conversation to view messages</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <ConversationView
                  thread={activeThread}
                  messages={messages}
                  loading={messagesLoading}
                  showInfoPanel={showInfoPanel}
                  onToggleInfoPanel={() => { setShowInfoPanel(!showInfoPanel); setShowSessionsPanel(false); }}
                  onArchiveThread={handleArchiveFromConversation}
                >
                  <Composer
                    thread={activeThread}
                    optOutKeyword={optOutKeyword}
                    isFirstMessage={isFirstMessage}
                    channel={'sms'}
                    onSend={handleSendMessage}
                    disabled={false}
                    leadId={activeThread.lead_id || activeThread.leads?.id || undefined}
                  />
                </ConversationView>
              </div>
              {showInfoPanel && (activeThread.lead_id || activeThread.leads?.id) && (
                <ContactInfoPanel
                  leadId={activeThread.lead_id || activeThread.leads?.id || ''}
                  initialData={activeThread.leads || undefined}
                  contactType={activeThread.contact_type}
                  onClose={() => setShowInfoPanel(false)}
                  onSaved={refreshActiveThread}
                />
              )}
              {showSessionsPanel && (activeThread.lead_id || activeThread.leads?.id) && (
                <SessionsPanel
                  leadId={activeThread.lead_id || activeThread.leads?.id || ''}
                  onClose={() => setShowSessionsPanel(false)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Send SMS Modal (for new conversations) */}
      <SendSMSModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={() => {
          setShowSendModal(false);
          refreshThreads();
        }}
      />
    </div>
  );
}

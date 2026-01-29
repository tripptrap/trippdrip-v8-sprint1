"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import FiltersBar, { Filters } from "@/components/FiltersBar";
import { leads as seedLeads, threads as seedThreads, messages as seedMessages, findLead as seedFindLead } from "@/lib/db";
import { loadStore, saveStore, STORE_UPDATED_EVENT } from "@/lib/localStore";
import { spendPoints, getPointsBalance } from "@/lib/pointsStore";
import { calculateSMSCredits, getCharacterWarning } from "@/lib/creditCalculator";
import { loadSettings, type Settings } from "@/lib/settingsStore";
import CustomModal from "@/components/CustomModal";
import SendSMSModal from "@/components/SendSMSModal";

type Msg = { id:number; thread_id:number; direction:'in'|'out'; sender:'lead'|'agent'; body:string; created_at:string };
type FlowStep = {
  id: string;
  yourMessage: string;
  responses: any[];
  tag?: {
    label: string;
    color: string;
  };
};
type ConversationFlow = {
  id: string;
  name: string;
  steps: FlowStep[];
  createdAt: string;
  updatedAt: string;
};

function findLead(id:number, leads:any[]){ return (leads||[]).find((l:any)=> l.id===id) || seedFindLead(id); }
function threadMessages(thread_id:number, all:any[]){ return (all||[]).filter((m:any)=> m.thread_id===thread_id); }

// Helper function to guess timezone from phone number area code
function getTimezoneFromPhone(phone: string | undefined): string {
  if (!phone) return '';

  // Extract area code (first 3 digits after +1 or just first 3 digits)
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.substring(cleaned.length - 10, cleaned.length - 7) : '';

  // Common area code to timezone mappings (abbreviated)
  const timezoneMap: { [key: string]: string } = {
    // Eastern Time
    '212': 'ET', '646': 'ET', '917': 'ET', '347': 'ET', // NYC
    '305': 'ET', '786': 'ET', '954': 'ET', // Miami
    '404': 'ET', '678': 'ET', '770': 'ET', // Atlanta
    '617': 'ET', '857': 'ET', // Boston
    '202': 'ET', // DC
    '215': 'ET', '267': 'ET', // Philadelphia
    '407': 'ET', '321': 'ET', // Orlando
    '704': 'ET', '980': 'ET', // Charlotte

    // Central Time
    '312': 'CT', '773': 'CT', '872': 'CT', // Chicago
    '713': 'CT', '281': 'CT', '832': 'CT', // Houston
    '214': 'CT', '469': 'CT', '972': 'CT', // Dallas
    '210': 'CT', '726': 'CT', // San Antonio
    '512': 'CT', '737': 'CT', // Austin
    '314': 'CT', // St. Louis
    '504': 'CT', // New Orleans
    '615': 'CT', '629': 'CT', // Nashville

    // Mountain Time
    '303': 'MT', '720': 'MT', // Denver
    '602': 'MT', '623': 'MT', '480': 'MT', // Phoenix
    '505': 'MT', // Albuquerque
    '801': 'MT', '385': 'MT', // Salt Lake City

    // Pacific Time
    '213': 'PT', '310': 'PT', '323': 'PT', '424': 'PT', '818': 'PT', // LA
    '415': 'PT', '628': 'PT', // San Francisco
    '619': 'PT', '858': 'PT', // San Diego
    '206': 'PT', '253': 'PT', // Seattle
    '503': 'PT', '971': 'PT', // Portland
    '702': 'PT', // Las Vegas
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

async function loadFlows(): Promise<ConversationFlow[]> {
  if (typeof window === "undefined") return [];

  try {
    const response = await fetch('/api/flows');
    const data = await response.json();

    if (data.ok && data.items) {
      return data.items.map((flow: any) => ({
        id: flow.id,
        name: flow.name,
        steps: flow.steps || [],
        createdAt: flow.created_at,
        updatedAt: flow.updated_at
      }));
    }

    return [];
  } catch (e) {
    console.error("Error loading flows:", e);
    return [];
  }
}

async function getThreadFlowStep(threadId: number): Promise<{ label: string; color: string } | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch(`/api/threads/${threadId}`);
    const data = await response.json();

    if (data.ok && data.thread && data.thread.flow_config) {
      return data.thread.flow_config;
    }
    return null;
  } catch (e) {
    console.error('Error loading thread flow step:', e);
    return null;
  }
}

async function setThreadFlowStep(threadId: number, tag: { label: string; color: string } | null) {
  try {
    await fetch(`/api/threads/${threadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_config: tag
      })
    });
  } catch (e) {
    console.error('Error setting thread flow step:', e);
  }
}

function TextsPageContent(){
  const [store, setStore] = useState<any>({ leads: seedLeads, threads: seedThreads, messages: seedMessages });
  const [filters, setFilters] = useState<Filters>({});
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  // Opt-out keyword setup modal
  const [showOptOutModal, setShowOptOutModal] = useState(false);
  const [optOutKeyword, setOptOutKeyword] = useState('');
  const [savingOptOut, setSavingOptOut] = useState(false);

  const search = useSearchParams();

  const refresh = async ()=>{ const s = await loadStore(); if (s) setStore(s); };

  useEffect(()=>{
    refresh();
    loadFlows().then(setFlows).catch(e => {
      console.error("Error loading flows:", e);
      setFlows([]);
    });

    // Check if opt-out keyword is configured
    loadSettings().then((settings) => {
      if (!settings.optOutKeyword) {
        setShowOptOutModal(true);
      } else {
        setOptOutKeyword(settings.optOutKeyword);
      }
    }).catch(console.error);

    // Set up real-time polling for new messages (every 5 seconds)
    const pollInterval = setInterval(() => {
      refresh();
    }, 5000);

    // live updates
    window.addEventListener(STORE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") refresh(); });
    return ()=>{
      clearInterval(pollInterval);
      window.removeEventListener(STORE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", ()=>{});
    };
  }, []);

  useEffect(()=>{
    const idStr = search.get("open");
    const id = idStr ? Number(idStr) : NaN;
    if (!isNaN(id)) setActiveThreadId(id);
  }, [search]);

  // Threads that have EVER had a lead reply
  const smsThreads = useMemo(()=> (store.threads||[]).filter((t:any)=> t.channel === "sms"), [store]);
  const repliedThreadIds = useMemo(()=>{
    const ids = new Set<number>();
    for (const m of (store.messages||[])) if (m.direction === "in" && m.sender === "lead") ids.add(m.thread_id);
    return ids;
  }, [store]);
  const replyEligible = useMemo(()=> smsThreads.filter((t:any)=> repliedThreadIds.has(t.id)), [smsThreads, repliedThreadIds]);

  const rows = useMemo(()=>{
    let r = replyEligible;
    if (filters.unread)   r = r.filter((t:any)=> t.unread);
    if (filters.campaign) r = r.filter((t:any)=> String(t.campaign_id) === String(filters.campaign));
    if (filters.q){
      const q = filters.q.toLowerCase();
      r = r.filter((t:any)=>{
        const L = findLead(t.lead_id, store.leads);
        return [L.first_name, L.last_name, L.phone, t.last_message_snippet].join(" ").toLowerCase().includes(q);
      });
    }
    return r.sort((a:any,b:any)=> new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [replyEligible, filters, store]);

  const activeThread = useMemo(()=> (store.threads||[]).find((t:any)=> t.id === activeThreadId) || null, [store, activeThreadId]);
  const activeLead   = useMemo(()=> activeThread ? findLead(activeThread.lead_id, store.leads) : null, [activeThread, store.leads]);
  const activeMsgs   = useMemo(()=> activeThread ? threadMessages(activeThread.id, store.messages) : [], [activeThread, store.messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (activeMsgs.length > 0) {
      // Play notification sound for new incoming messages
      if (previousMessageCount > 0 && activeMsgs.length > previousMessageCount) {
        const lastMsg = activeMsgs[activeMsgs.length - 1];
        // Only play sound for incoming messages (from lead)
        if (lastMsg.direction === 'in' && lastMsg.sender === 'lead') {
          // Simple notification sound (using Web Audio API)
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
            oscillator.stop(audioContext.currentTime + 0.1);
          } catch (e) {
            console.log('Audio notification not supported');
          }
        }
      }
      setPreviousMessageCount(activeMsgs.length);

      setTimeout(() => {
        const messagesEnd = document.getElementById('messages-end');
        if (messagesEnd) {
          messagesEnd.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [activeMsgs.length, previousMessageCount]);

  async function sendSimulated(body:string){
    if (!activeThread) return;
    const s = await loadStore() || { leads:[], threads:[], messages:[] };
    const now = new Date().toISOString();
    s.messages.push({ id: Date.now(), thread_id: activeThread.id, direction: "out", sender: "agent", body, created_at: now });
    const th = s.threads.find((t:any)=> t.id===activeThread.id);
    if (th){ th.last_message_snippet = body; th.last_sender = "agent"; th.updated_at = now; th.unread = false; }
    await saveStore(s); // triggers live refresh via event
  }

  async function scheduleMessage(body: string, scheduledFor: string) {
    if (!activeLead) return;

    try {
      const res = await fetch('/api/messages/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: activeLead.id,
          body,
          scheduledFor,
          channel: 'sms'
        })
      });

      const data = await res.json();

      if (data.ok) {
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Message Scheduled',
          message: `Message scheduled for ${new Date(scheduledFor).toLocaleString()}`
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Scheduling Failed',
          message: data.error || 'Failed to schedule message'
        });
      }
    } catch (e: any) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Scheduling Error',
        message: e?.message || 'Failed to schedule message'
      });
    }
  }

  async function generateAIResponse() {
    if (!activeThread || !activeLead) return;

    // Check points balance
    const balance = await getPointsBalance();
    if (balance < 1) {
      setModal({
        isOpen: true,
        type: 'confirm',
        title: 'Insufficient Points',
        message: "You don't have enough points to generate an AI response. Would you like to purchase more points?",
        onConfirm: () => {
          window.location.href = "/points";
        }
      });
      return;
    }

    setIsGeneratingResponse(true);
    try {
      // Get the selected flow if any
      const selectedFlow = selectedFlowId ? flows.find(f => f.id === selectedFlowId) : null;

      const response = await fetch("/api/ai-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: activeMsgs,
          leadName: `${activeLead.first_name} ${activeLead.last_name}`,
          leadInfo: activeLead,
          flowContext: selectedFlow // Pass the selected flow to guide AI responses
        })
      });
      const data = await response.json();
      if (data.response) {
        // Deduct 1 point for AI response
        const result = await spendPoints(1, `AI response for ${activeLead.first_name} ${activeLead.last_name}`);
        if (result.success) {
          await sendSimulated(data.response);
        } else {
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Points Error',
            message: 'Failed to deduct points. Please try again.'
          });
        }
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'AI Response Error',
        message: 'Failed to generate AI response'
      });
    } finally {
      setIsGeneratingResponse(false);
    }
  }


  return (
    <div className="space-y-4">
      {/* Opt-Out Keyword Setup Modal */}
      {showOptOutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Set Up Opt-Out Keyword
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Before you can send messages, you must set an opt-out keyword. This keyword will be included in the first message sent to each new lead so they can opt out of future messages.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Opt-Out Keyword
              </label>
              <input
                type="text"
                value={optOutKeyword}
                onChange={(e) => setOptOutKeyword(e.target.value.toUpperCase())}
                placeholder="e.g. STOP"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                autoFocus
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                First messages will include: &quot;Reply {optOutKeyword || 'STOP'} to opt out&quot;
              </p>
            </div>
            <button
              disabled={!optOutKeyword.trim() || savingOptOut}
              onClick={async () => {
                if (!optOutKeyword.trim()) return;
                setSavingOptOut(true);
                try {
                  const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ optOutKeyword: optOutKeyword.trim().toUpperCase() }),
                  });
                  if (res.ok) {
                    setShowOptOutModal(false);
                  }
                } catch (err) {
                  console.error('Failed to save opt-out keyword:', err);
                } finally {
                  setSavingOptOut(false);
                }
              }}
              className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {savingOptOut ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Texts</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your text conversations with leads</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSendModal(true)}
            className="px-4 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2 font-medium text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Send Message
          </button>
          {flows.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-900">Flow:</label>
              <select
                value={selectedFlowId || ""}
                onChange={(e) => setSelectedFlowId(e.target.value || null)}
                className="input-dark px-3 py-1 rounded text-sm"
              >
                <option value="">None (AI freestyles)</option>
                {flows.map(flow => (
                  <option key={flow.id} value={flow.id}>{flow.name}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-900">Reply with AI</span>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
            </div>
          </label>
        </div>
      </div>
      <FiltersBar onChange={setFilters} />

      <div className="grid grid-cols-12 gap-4">
        {/* Left: list */}
        <div className="col-span-12 md:col-span-5">
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-white px-3 py-2 text-sm font-medium">Conversations</div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/10">
{rows.map((t:any)=> {
                const L = findLead(t.lead_id, store.leads);
                const active = t.id === activeThreadId;
                const flowStepTag = t.flow_config;
                const isSold = L.disposition === 'sold' || L.status === 'sold';
                const isArchived = L.disposition === 'not_interested' || L.status === 'archived';
                return (
                  <button
                    key={t.id}
                    className={`w-full text-left px-3 py-3 hover:bg-slate-50 dark:bg-slate-800 transition-colors relative ${
                      active ? "bg-sky-500/10 border-l-2 border-sky-500" : ""
                    } ${isSold ? "bg-sky-50 border-l-4 border-sky-500" : ""} ${
                      isArchived ? "opacity-50" : ""
                    } ${t.unread && !active ? "bg-white" : ""}`}
                    onClick={()=> setActiveThreadId(t.id)}
                    title={t.last_message_snippet}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 truncate flex-1">
                        {/* Avatar Circle */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-900 dark:text-slate-100 font-semibold text-sm shrink-0 ${
                          isSold ? "bg-sky-600" : "bg-gradient-to-br from-sky-400 to-sky-400"
                        }`}>
                          {L.first_name?.charAt(0)}{L.last_name?.charAt(0)}
                        </div>

                        <div className="truncate flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`truncate font-medium ${isSold ? "text-sky-600" : "text-slate-900 dark:text-slate-100"} ${t.unread ? "font-semibold" : ""}`}>
                              {L.first_name} {L.last_name}
                            </div>
                            {isSold && (
                              <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-900/40 text-sky-600 border border-sky-500/40">
                                Sold
                              </span>
                            )}
                            {flowStepTag && (
                              <span
                                className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{
                                  backgroundColor: `${flowStepTag.color}20`,
                                  color: flowStepTag.color,
                                  border: `1px solid ${flowStepTag.color}40`
                                }}
                              >
                                {flowStepTag.label}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs truncate ${isSold ? "text-sky-300/70" : "text-[var(--muted)]"} ${t.unread ? "font-medium text-slate-700 dark:text-slate-300" : ""}`}>
                            {t.last_message_snippet}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                        <div className={`text-[10px] ${isSold ? "text-sky-600/60" : "text-[var(--muted)]"}`}>
                          {(() => {
                            const updatedAt = new Date(t.updated_at);
                            const now = new Date();
                            const diffMs = now.getTime() - updatedAt.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);

                            if (diffMins < 1) return 'Just now';
                            if (diffMins < 60) return `${diffMins}m`;
                            if (diffHours < 24) return `${diffHours}h`;
                            if (diffDays < 7) return `${diffDays}d`;
                            return updatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          })()}
                        </div>
                        {t.unread && (
                          <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-gray-900">1</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {rows.length === 0 && (
                <div className="px-3 py-6 text-sm text-[var(--muted)] text-center">
                  No conversations yet.<br/>
                  <span className="text-xs">Import leads and start a campaign to begin texting.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: conversation */}
        <div className="col-span-12 md:col-span-7">
          {!activeThread ? (
            <div className="card">
              <div className="text-[var(--muted)]">
                {rows.length === 0 ? (
                  <>
                    <p className="mb-4">No conversations yet. Get started by:</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Importing leads from the Leads page</li>
                      <li>Creating a campaign</li>
                      <li>Starting conversations with your leads</li>
                    </ol>
                  </>
                ) : (
                  "Select a conversation on the left to view messages."
                )}
              </div>
            </div>
          ) : (
            <div className="card p-0">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{activeLead?.first_name} {activeLead?.last_name}</div>
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span>{activeLead?.phone}</span>
                      {(() => {
                        const timezone = getTimezoneFromPhone(activeLead?.phone);
                        const currentTime = getCurrentTimeInTimezone(timezone);
                        return currentTime ? (
                          <>
                            <span className="text-gray-900/20">•</span>
                            <span className="text-sky-600" title={`Lead's local time`}>🕐 {currentTime}</span>
                          </>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {useAI && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border border-sky-200 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></div>
                      <span className="text-sm text-blue-300">AI Mode Active</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto max-h-[55vh]" id="messages-container">
                {activeMsgs.map((m:Msg, index: number)=> {
                  const isLastMessage = index === activeMsgs.length - 1;
                  const isFirstMessageOfDay = index === 0 || new Date(activeMsgs[index - 1].created_at).toDateString() !== new Date(m.created_at).toDateString();

                  return (
                    <div key={m.id}>
                      {/* Date separator */}
                      {isFirstMessageOfDay && (
                        <div className="flex items-center justify-center my-4">
                          <div className="px-3 py-1 bg-white rounded-full text-xs text-[var(--muted)]">
                            {new Date(m.created_at).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: new Date(m.created_at).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                            })}
                          </div>
                        </div>
                      )}

                      <div className={`flex ${m.direction==='out' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                          m.direction==='out'
                            ? 'bg-sky-600 text-white rounded-br-md'
                            : 'bg-slate-50 dark:bg-slate-800 rounded-bl-md'
                        }`}>
                          <div className="break-words whitespace-pre-wrap">{m.body}</div>
                          <div className={`text-[10px] mt-1 flex items-center gap-1 ${
                            m.direction==='out' ? 'text-blue-200' : 'text-[var(--muted)]'
                          }`}>
                            <span>{new Date(m.created_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}</span>
                            {m.direction==='out' && (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Auto-scroll anchor */}
                      {isLastMessage && <div id="messages-end" />}
                    </div>
                  );
                })}
                {activeMsgs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <svg className="w-16 h-16 text-gray-900/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm text-[var(--muted)]">No messages yet.</p>
                    <p className="text-xs text-[var(--muted)] mt-1">Start the conversation below!</p>
                  </div>
                )}
              </div>

              <Composer
                onSend={sendSimulated}
                useAI={useAI}
                onGenerateAI={generateAIResponse}
                isGenerating={isGeneratingResponse}
                isSold={activeLead?.disposition === 'sold' || activeLead?.status === 'sold'}
                onSchedule={scheduleMessage}
                lead={activeLead}
              />
            </div>
          )}
        </div>
      </div>

      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'confirm' ? 'Yes' : 'OK'}
        cancelText="No"
      />

      <SendSMSModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={() => {
          setShowSendModal(false);
          refresh();
        }}
      />
    </div>
  );
}

function Composer({
  onSend,
  useAI,
  onGenerateAI,
  isGenerating,
  isSold,
  onSchedule,
  lead
}: {
  onSend: (body: string) => void;
  useAI: boolean;
  onGenerateAI: () => void;
  isGenerating: boolean;
  isSold?: boolean;
  onSchedule?: (body: string, scheduledFor: string) => void;
  lead?: any;
}) {
  const [text, setText] = useState("");
  const [mediaCount, setMediaCount] = useState(0);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Calculate credits in real-time
  const creditCalc = useMemo(() => calculateSMSCredits(text, mediaCount), [text, mediaCount]);
  const charWarning = useMemo(() => getCharacterWarning(text.length), [text.length]);

  async function sendRealMessage(body: string) {
    if (!lead || !lead.phone) {
      setError('No phone number available for this lead');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          toPhone: lead.phone,
          messageBody: body,
          channel,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);

      // Also update the simulated store
      onSend(body);
    } catch (err: any) {
      setError(err.message || `Failed to send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (scheduleMode && scheduledDate && scheduledTime && text.trim() && onSchedule) {
      // Schedule the message
      const scheduledFor = `${scheduledDate}T${scheduledTime}:00`;
      onSchedule(text.trim(), scheduledFor);
      setText('');
      setMediaCount(0);
      setScheduleMode(false);
      setScheduledDate('');
      setScheduledTime('');
    } else if (useAI && !text.trim()) {
      // If AI mode is on and no text, generate AI response
      onGenerateAI();
    } else if (text.trim()) {
      // Send real SMS/WhatsApp message
      await sendRealMessage(text.trim());
      setText('');
      setMediaCount(0);
    }
  }

  return (
    <div className={`p-3 border-t ${isSold ? "border-sky-200 bg-sky-900/10" : "border-slate-200 dark:border-slate-700"}`}>
      {/* Error & Success Messages */}
      {error && (
        <div className="mb-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-2 bg-sky-50 border border-sky-200 text-sky-700 px-3 py-2 rounded text-xs">
          {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} sent successfully!
        </div>
      )}

      {/* Channel Selector & Schedule Toggle */}
      <div className="mb-2 flex items-center gap-4">
        {/* Channel Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">Send via:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              value="sms"
              checked={channel === 'sms'}
              onChange={(e) => setChannel(e.target.value as 'sms' | 'whatsapp')}
              className="w-3 h-3"
              disabled={sending || success}
            />
            <span className="text-xs text-gray-300">SMS</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              value="whatsapp"
              checked={channel === 'whatsapp'}
              onChange={(e) => setChannel(e.target.value as 'sms' | 'whatsapp')}
              className="w-3 h-3"
              disabled={sending || success}
            />
            <span className="text-xs text-gray-300">WhatsApp</span>
          </label>
        </div>

        {/* Schedule Toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.checked)}
            className="rounded"
          />
          Schedule Send
        </label>
        {scheduleMode && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-gray-200 [color-scheme:dark]"
              style={{ colorScheme: 'dark' }}
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-gray-200 [color-scheme:dark]"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      {/* Credit Cost Display */}
      {text.length > 0 && (
        <div className="mb-2 text-xs">
          <span className={`font-medium ${creditCalc.credits > 1 ? "text-yellow-400" : "text-slate-400 dark:text-slate-500"}`}>
            {creditCalc.credits} credit{creditCalc.credits !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        {useAI ? (
          <>
            <input
              className={`flex-1 input-dark px-4 py-3 rounded-lg ${isSold ? "border-2 border-sky-500/50 bg-sky-50 text-sky-100 placeholder-sky-300/50" : ""}`}
              placeholder="AI will generate a response, or type to override..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              className={`font-medium px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${isSold ? "bg-sky-600 hover:bg-sky-700 text-white" : "bg-sky-500 hover:bg-sky-600 text-white"}`}
              onClick={handleSend}
              disabled={isGenerating || sending || (scheduleMode && (!scheduledDate || !scheduledTime))}
            >
              {isGenerating ? "Generating..." : sending ? "Sending..." : scheduleMode ? "Schedule" : text.trim() ? `Send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}` : "AI Reply"}
            </button>
          </>
        ) : (
          <>
            <input
              className={`flex-1 input-dark px-4 py-3 rounded-lg ${isSold ? "border-2 border-sky-500/50 bg-sky-50 text-sky-100 placeholder-sky-300/50" : ""}`}
              placeholder="Type a message…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim() && !scheduleMode && !sending) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
            />
            <button
              className={`font-medium px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${isSold ? "bg-sky-600 hover:bg-sky-700 text-white" : "bg-sky-500 hover:bg-sky-600 text-white"}`}
              onClick={handleSend}
              disabled={!text.trim() || sending || (scheduleMode && (!scheduledDate || !scheduledTime))}
            >
              {sending ? "Sending..." : scheduleMode ? "Schedule" : `Send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TextsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
      <TextsPageContent />
    </Suspense>
  );
}

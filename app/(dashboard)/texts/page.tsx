"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import FiltersBar, { Filters } from "@/components/FiltersBar";
import { leads as seedLeads, threads as seedThreads, messages as seedMessages, findLead as seedFindLead } from "@/lib/db";
import { loadStore, saveStore, STORE_UPDATED_EVENT } from "@/lib/localStore";
import { spendPoints, getPointsBalance } from "@/lib/pointsStore";
import { calculateSMSCredits, getCharacterWarning } from "@/lib/creditCalculator";

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

function loadFlows(): ConversationFlow[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem("conversationFlows");
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function getThreadFlowStep(threadId: number): { label: string; color: string } | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(`thread_${threadId}_flowStep`);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function setThreadFlowStep(threadId: number, tag: { label: string; color: string } | null) {
  if (tag) {
    localStorage.setItem(`thread_${threadId}_flowStep`, JSON.stringify(tag));
  } else {
    localStorage.removeItem(`thread_${threadId}_flowStep`);
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

  function initializeDemoConversations() {
    const demoLeads = [
      {
        id: "demo_lead_1",
        first_name: "Sarah",
        last_name: "Johnson",
        phone: "+15551234567",
        email: "sarah.johnson@example.com",
        state: "CA",
        tags: ["hot-lead", "interested", "demo"],
        status: "active",
        disposition: "qualified"
      },
      {
        id: "demo_lead_2",
        first_name: "Michael",
        last_name: "Rodriguez",
        phone: "+15559876543",
        email: "m.rodriguez@example.com",
        state: "TX",
        tags: ["callback", "demo"],
        status: "active",
        disposition: "callback"
      },
      {
        id: "demo_lead_3",
        first_name: "Jennifer",
        last_name: "Chen",
        phone: "+15555551234",
        email: "jennifer.chen@example.com",
        state: "NY",
        tags: ["sold", "demo", "vip"],
        status: "sold",
        disposition: "sold"
      }
    ];

    const demoThreads = [
      {
        id: Date.now() + 1,
        lead_id: "demo_lead_1",
        lead_name: "Sarah Johnson",
        lead_phone: "+15551234567",
        channel: "sms",
        last_message_snippet: "Great! It's 30% off all products until March 31st. Can I send you the catalog?",
        last_sender: "agent",
        unread: false,
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 2,
        lead_id: "demo_lead_3",
        lead_name: "Jennifer Chen",
        lead_phone: "+15555551234",
        channel: "sms",
        last_message_snippet: "Just placed my order! Thanks so much!",
        last_sender: "lead",
        unread: true,
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 3,
        lead_id: "demo_lead_2",
        lead_name: "Michael Rodriguez",
        lead_phone: "+15559876543",
        channel: "sms",
        last_message_snippet: "Can you call me back tomorrow? I have some questions.",
        last_sender: "lead",
        unread: true,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
      }
    ];

    const threadId1 = Date.now() + 1;
    const threadId2 = Date.now() + 2;
    const threadId3 = Date.now() + 3;

    const demoMessages = [
      // Sarah Johnson conversation
      {
        id: Date.now() + 10,
        thread_id: threadId1,
        direction: "out",
        sender: "agent",
        body: "Hi Sarah! Our Spring Sale is live with 30% off. Interested?",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 11,
        thread_id: threadId1,
        direction: "in",
        sender: "lead",
        body: "Yes! Tell me more about this sale!",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 12,
        thread_id: threadId1,
        direction: "out",
        sender: "agent",
        body: "Great! It's 30% off all products until March 31st. Can I send you the catalog?",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString()
      },
      // Jennifer Chen conversation (SOLD)
      {
        id: Date.now() + 13,
        thread_id: threadId2,
        direction: "out",
        sender: "agent",
        body: "Hi Jennifer! Our Spring Sale is live with 30% off. Interested?",
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 14,
        thread_id: threadId2,
        direction: "in",
        sender: "lead",
        body: "Absolutely! I've been waiting for this!",
        created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 15,
        thread_id: threadId2,
        direction: "out",
        sender: "agent",
        body: "Perfect! I'll send you the details right now.",
        created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 16,
        thread_id: threadId2,
        direction: "in",
        sender: "lead",
        body: "Just placed my order! Thanks so much!",
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      },
      // Michael Rodriguez conversation
      {
        id: Date.now() + 17,
        thread_id: threadId3,
        direction: "out",
        sender: "agent",
        body: "Hey Michael, just checking in! Any questions about our service?",
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: Date.now() + 18,
        thread_id: threadId3,
        direction: "in",
        sender: "lead",
        body: "Can you call me back tomorrow? I have some questions.",
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
      }
    ];

    const s = loadStore() || { leads: [], threads: [], messages: [] };

    // Add demo data
    s.leads = [...demoLeads, ...s.leads];
    s.threads = [...demoThreads, ...s.threads];
    s.messages = [...demoMessages, ...s.messages];

    saveStore(s);
    alert('Demo conversations added! The page will refresh.');
    window.location.reload();
  }
  const search = useSearchParams();

  const refresh = ()=>{ const s = loadStore(); if (s) setStore(s); };

  useEffect(()=>{
    refresh();
    setFlows(loadFlows());
    // live updates
    window.addEventListener(STORE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") refresh(); });
    return ()=>{
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

  function sendSimulated(body:string){
    if (!activeThread) return;
    const s = loadStore() || { leads:[], threads:[], messages:[] };
    const now = new Date().toISOString();
    s.messages.push({ id: Date.now(), thread_id: activeThread.id, direction: "out", sender: "agent", body, created_at: now });
    const th = s.threads.find((t:any)=> t.id===activeThread.id);
    if (th){ th.last_message_snippet = body; th.last_sender = "agent"; th.updated_at = now; th.unread = false; }
    saveStore(s); // triggers live refresh via event
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
        alert(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}`);
      } else {
        alert(`Error: ${data.error || 'Failed to schedule message'}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message || 'Failed to schedule message'}`);
    }
  }

  async function generateAIResponse() {
    if (!activeThread || !activeLead) return;

    // Check points balance
    const balance = getPointsBalance();
    if (balance < 1) {
      if (confirm("You don't have enough points to generate an AI response. Would you like to purchase more points?")) {
        window.location.href = "/points";
      }
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
        const result = spendPoints(1, `AI response for ${activeLead.first_name} ${activeLead.last_name}`);
        if (result.success) {
          sendSimulated(data.response);
        } else {
          alert("Failed to deduct points. Please try again.");
        }
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      alert("Failed to generate AI response");
    } finally {
      setIsGeneratingResponse(false);
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Texts</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your text conversations with leads</p>
        </div>
        <div className="flex items-center gap-3">
          {flows.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-white">Flow:</label>
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
            <span className="text-sm text-white">Reply with AI</span>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </div>
          </label>
        </div>
      </div>
      <FiltersBar onChange={setFilters} />

      <div className="grid grid-cols-12 gap-4">
        {/* Left: list */}
        <div className="col-span-12 md:col-span-5">
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <div className="bg-white/5 px-3 py-2 text-sm font-medium">Conversations</div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/10">
{rows.map((t:any)=> {
                const L = findLead(t.lead_id, store.leads);
                const active = t.id === activeThreadId;
                const flowStepTag = getThreadFlowStep(t.id);
                const isSold = L.disposition === 'sold' || L.status === 'sold';
                const isArchived = L.disposition === 'not_interested' || L.status === 'archived';
                return (
                  <button
                    key={t.id}
                    className={`w-full text-left px-3 py-2 hover:bg-white/5 ${active ? "bg-white/10" : ""} ${isSold ? "bg-green-900/20 border-l-4 border-green-500" : ""} ${isArchived ? "opacity-50" : ""}`}
                    onClick={()=> setActiveThreadId(t.id)}
                    title={t.last_message_snippet}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <div className={`truncate font-medium ${isSold ? "text-green-400" : ""}`}>{L.first_name} {L.last_name}</div>
                        {isSold && (
                          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-green-900/40 text-green-400 border border-green-500/40">
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
                      {t.unread && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />}
                    </div>
                    <div className={`text-xs truncate ${isSold ? "text-green-300/70" : "text-[var(--muted)]"}`}>{t.last_message_snippet}</div>
                    <div className={`text-[10px] ${isSold ? "text-green-400/60" : "text-[var(--muted)]"}`}>
                      Campaign {t.campaign_id ?? "-"} • {new Date(t.updated_at).toLocaleString()}
                    </div>
                  </button>
                );
              })}
              {rows.length === 0 && (
                <div className="px-3 py-6 text-sm text-[var(--muted)] text-center">
                  No conversations yet.<br/>
                  <span className="text-xs">Import leads and start a campaign to begin texting.</span>
                  <button
                    onClick={initializeDemoConversations}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                  >
                    Add Demo Conversations
                  </button>
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
              <div className="p-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">{activeLead?.first_name} {activeLead?.last_name}</div>
                    <div className="text-xs text-[var(--muted)]">{activeLead?.phone}</div>
                  </div>
                  {useAI && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                      <span className="text-sm text-blue-300">AI Mode Active</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto max-h-[55vh]">
                {activeMsgs.map((m:Msg)=> (
                  <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-xl ${m.direction==='out' ? 'ml-auto bg-blue-500/20' : 'bg-white/10'}`}>
                    <div className="text-xs text-[var(--muted)] mb-1">{new Date(m.created_at).toLocaleString()}</div>
                    <div>{m.body}</div>
                  </div>
                ))}
                {activeMsgs.length === 0 && (
                  <div className="text-sm text-[var(--muted)]">No messages yet.</div>
                )}
              </div>

              <Composer
                onSend={sendSimulated}
                useAI={useAI}
                onGenerateAI={generateAIResponse}
                isGenerating={isGeneratingResponse}
                isSold={activeLead?.disposition === 'sold' || activeLead?.status === 'sold'}
                onSchedule={scheduleMessage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({
  onSend,
  useAI,
  onGenerateAI,
  isGenerating,
  isSold,
  onSchedule
}: {
  onSend: (body: string) => void;
  useAI: boolean;
  onGenerateAI: () => void;
  isGenerating: boolean;
  isSold?: boolean;
  onSchedule?: (body: string, scheduledFor: string) => void;
}) {
  const [text, setText] = useState("");
  const [mediaCount, setMediaCount] = useState(0);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Calculate credits in real-time
  const creditCalc = useMemo(() => calculateSMSCredits(text, mediaCount), [text, mediaCount]);
  const charWarning = useMemo(() => getCharacterWarning(text.length), [text.length]);

  function handleSend() {
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
      // If there's text, send it
      onSend(text.trim());
      setText('');
      setMediaCount(0);
    }
  }

  return (
    <div className={`p-3 border-t ${isSold ? "border-green-500/30 bg-green-900/10" : "border-white/10"}`}>
      {/* Schedule Toggle */}
      <div className="mb-2 flex items-center gap-2">
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
              className="px-2 py-1 text-xs rounded border border-white/20 bg-[#0c1420] text-gray-200 [color-scheme:dark]"
              style={{ colorScheme: 'dark' }}
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="px-2 py-1 text-xs rounded border border-white/20 bg-[#0c1420] text-gray-200 [color-scheme:dark]"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      {/* Credit Cost Display */}
      {text.length > 0 && (
        <div className="mb-2 text-xs">
          <span className={`font-medium ${creditCalc.credits > 1 ? "text-yellow-400" : "text-gray-400"}`}>
            {creditCalc.credits} credit{creditCalc.credits !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        {useAI ? (
          <>
            <input
              className={`flex-1 input-dark px-4 py-3 rounded-lg ${isSold ? "border-2 border-green-500/50 bg-green-900/20 text-green-100 placeholder-green-300/50" : ""}`}
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
              className={`font-medium px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${isSold ? "bg-green-600 hover:bg-green-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
              onClick={handleSend}
              disabled={isGenerating || (scheduleMode && (!scheduledDate || !scheduledTime))}
            >
              {isGenerating ? "Generating..." : scheduleMode ? "Schedule" : text.trim() ? "Send" : "AI Reply"}
            </button>
          </>
        ) : (
          <>
            <input
              className={`flex-1 input-dark px-4 py-3 rounded-lg ${isSold ? "border-2 border-green-500/50 bg-green-900/20 text-green-100 placeholder-green-300/50" : ""}`}
              placeholder="Type a message…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && text.trim() && !scheduleMode) {
                  e.preventDefault();
                  onSend(text.trim());
                  setText('');
                }
              }}
            />
            <button
              className={`font-medium px-6 py-3 rounded-lg disabled:opacity-50 ${isSold ? "bg-green-600 hover:bg-green-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
              onClick={handleSend}
              disabled={!text.trim() || (scheduleMode && (!scheduledDate || !scheduledTime))}
            >
              {scheduleMode ? "Schedule" : "Send"}
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

"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, User, Send, RotateCcw, ChevronDown, CheckCircle2, Circle, Loader2, Sparkles, FlaskConical, Tag } from "lucide-react";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface Flow {
  id: string;
  name: string;
  description?: string;
  requiredQuestions?: Array<{ question: string; fieldName: string }>;
  autonomyMode?: string;
  steps?: any[];
}

interface Message {
  id: string;
  role: "lead" | "ai";
  body: string;
  extracted?: Record<string, string>;  // answers pulled from THIS message
  timestamp: Date;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(true);

  // Conversation state — kept client-side, no DB writes
  const [messages, setMessages] = useState<Message[]>([]);
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ direction: string; body: string }>
  >([]);
  const [remainingQuestions, setRemainingQuestions] = useState<
    Array<{ question: string; fieldName: string }>
  >([]);
  const [allAnswered, setAllAnswered] = useState(false);
  const [pipelineTag, setPipelineTag] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load flows ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setFlows(data.items || []);
      })
      .catch(() => toast.error("Failed to load flows"))
      .finally(() => setFlowsLoading(false));
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Select flow ────────────────────────────────────────────────────────────
  function handleSelectFlow(flow: Flow) {
    setSelectedFlow(flow);
    setFlowDropdownOpen(false);
    resetConversation(flow);
  }

  function resetConversation(flow?: Flow) {
    const f = flow || selectedFlow;
    setMessages([]);
    setCollectedInfo({});
    setConversationHistory([]);
    setRemainingQuestions(f?.requiredQuestions || []);
    setAllAnswered(false);
    setPipelineTag(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function handleSend() {
    if (!input.trim() || !selectedFlow || sending) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "lead",
      body: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const sentText = input.trim();
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/demo/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: selectedFlow.id,
          message: sentText,
          collectedInfo,
          conversationHistory,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast.error(data.error || "AI error");
        return;
      }

      // Persist state
      setCollectedInfo(data.updatedCollectedInfo || {});
      setRemainingQuestions(data.remainingQuestions || []);
      setAllAnswered(data.allAnswered || false);
      if (data.pipelineTag) setPipelineTag(data.pipelineTag);

      // Update conversation history for next call
      setConversationHistory((prev) => [
        ...prev,
        { direction: "inbound", body: sentText },
        { direction: "outbound", body: data.aiResponse },
      ]);

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "ai",
        body: data.aiResponse,
        extracted: Object.keys(data.extracted || {}).length ? data.extracted : undefined,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      toast.error("Request failed");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const requiredQuestions = selectedFlow?.requiredQuestions || [];
  const answeredCount = Object.keys(collectedInfo).length;
  const totalRequired = requiredQuestions.length;
  const progressPct = totalRequired > 0 ? Math.round((answeredCount / totalRequired) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Flow Demo</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Test any flow using the exact same AI pipeline as production
            </p>
          </div>
        </div>

        {selectedFlow && (
          <button
            onClick={() => resetConversation()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Flow selector */}
      <div className="relative">
        <button
          onClick={() => setFlowDropdownOpen(!flowDropdownOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-400 dark:hover:border-violet-500 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            {flowsLoading ? (
              <span className="text-sm text-slate-400">Loading flows…</span>
            ) : selectedFlow ? (
              <div>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedFlow.name}</span>
                {selectedFlow.requiredQuestions?.length ? (
                  <span className="ml-2 text-xs text-slate-400">
                    {selectedFlow.requiredQuestions.length} required question{selectedFlow.requiredQuestions.length !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-slate-400">Select a flow to demo…</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${flowDropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {flowDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-72 overflow-y-auto">
            {flows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                No flows found. Create one in Flows first.
              </div>
            ) : (
              flows.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => handleSelectFlow(flow)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                    selectedFlow?.id === flow.id ? "bg-violet-50 dark:bg-violet-900/20" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{flow.name}</span>
                    <div className="flex items-center gap-2">
                      {flow.autonomyMode && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                          {flow.autonomyMode}
                        </span>
                      )}
                      {flow.requiredQuestions?.length ? (
                        <span className="text-xs text-slate-400">
                          {flow.requiredQuestions.length}Q
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {flow.description && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{flow.description}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedFlow ? (
        <div className="grid grid-cols-12 gap-4">
          {/* ── Chat panel ─────────────────────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-8 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-3">
                    <Bot className="w-7 h-7 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Start the conversation
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Type a message as if you were the lead. The AI will respond exactly as it would in production.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "lead" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "ai" && (
                      <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      </div>
                    )}
                    <div className={`max-w-[78%] space-y-1 ${msg.role === "lead" ? "items-end" : "items-start"} flex flex-col`}>
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "lead"
                            ? "bg-sky-600 text-white rounded-tr-sm"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-sm"
                        }`}
                      >
                        {msg.body}
                      </div>
                      {/* Extracted answers badge */}
                      {msg.extracted && Object.keys(msg.extracted).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {Object.entries(msg.extracted).map(([field, val]) => (
                            <span
                              key={field}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {field}: <span className="font-medium">{val}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] text-slate-400 px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {msg.role === "lead" && (
                      <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {sending && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-700">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 dark:border-slate-700 p-3 flex gap-2 items-end bg-white dark:bg-slate-800">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type as the lead… (Enter to send)"
                rows={1}
                className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-violet-500 focus:border-violet-500 outline-none"
                style={{ maxHeight: 100 }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="p-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-xl transition-colors shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* ── Debug panel ────────────────────────────────────────────────── */}
          <div className="col-span-12 lg:col-span-4 space-y-3">
            {/* Progress */}
            {totalRequired > 0 && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Qualification Progress
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    {answeredCount}/{totalRequired}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      allAnswered
                        ? "bg-emerald-500"
                        : progressPct > 50
                        ? "bg-sky-500"
                        : "bg-violet-500"
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {requiredQuestions.map((q) => {
                    const answered = !!collectedInfo[q.fieldName];
                    return (
                      <div key={q.fieldName} className="flex items-start gap-2">
                        {answered ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${answered ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>
                            {q.question}
                          </p>
                          {answered && (
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              "{collectedInfo[q.fieldName]}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pipeline tag */}
            {pipelineTag && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Pipeline Tag Applied
                  </span>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-emerald-500 text-white">
                  {pipelineTag}
                </span>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                  In production, this lead would be automatically tagged and their pipeline stage updated.
                </p>
              </div>
            )}

            {/* Collected info raw */}
            {Object.keys(collectedInfo).length > 0 && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Collected Info
                </p>
                <div className="space-y-1.5">
                  {Object.entries(collectedInfo).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono shrink-0">{k}</span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flow info */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Active Flow
              </p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{selectedFlow.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedFlow.autonomyMode && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                    {selectedFlow.autonomyMode}
                  </span>
                )}
                {totalRequired > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                    {totalRequired} required Qs
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                Uses the exact same AI pipeline as production — extractFlowAnswers → flowContext → generateReceptionistResponse
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
            <FlaskConical className="w-8 h-8 text-violet-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">
            Pick a flow to get started
          </h2>
          <p className="text-sm text-slate-400 max-w-sm">
            Select any flow from your library above. The AI will respond exactly as it would when a real lead texts in.
          </p>
        </div>
      )}
    </div>
  );
}

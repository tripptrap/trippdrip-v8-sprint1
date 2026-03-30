"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sparkles, Bot, Plus, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Circle, AlertCircle, Loader2, Save, X,
  MessageSquare, Zap, Eye, FlaskConical, Pencil, GripVertical,
  Phone, Globe, User, Building2, Target, HelpCircle, RotateCcw,
  Headphones
} from "lucide-react";
import Link from "next/link";
import ReceptionistSettings from "@/components/ReceptionistSettings";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────────────────

type RequiredQuestion = { question: string; fieldName: string };

type FlowStep = {
  id: string;
  yourMessage: string;
  responses?: { label: string; followUpMessage: string; action?: string }[];
  dripSequence?: { message: string; delayHours: number }[];
  tag?: { label: string; color: string };
};

type FlowContext = {
  whoYouAre?: string;
  whatOffering?: string;
  whoTexting?: string;
  clientGoals?: string;
  agentName?: string;
  companyName?: string;
  contactReason?: string;
  callbackNumber?: string;
  website?: string;
  autonomyMode?: string;
};

type Flow = {
  id: string;
  name: string;
  steps: FlowStep[];
  requiredQuestions: RequiredQuestion[];
  requiresCall: boolean;
  autonomyMode: "full_auto" | "suggest" | "manual";
  context: FlowContext;
  createdAt: string;
  updatedAt: string;
};

type Tab = "flows" | "receptionist";

// ── Health helpers ────────────────────────────────────────────────────────────

function flowHealth(flow: Flow): "good" | "warn" | "weak" {
  const hasContext = !!(flow.context?.whoYouAre && flow.context?.whatOffering && flow.context?.whoTexting);
  const hasQuestions = flow.requiredQuestions?.length > 0;
  const hasSteps = flow.steps?.length > 0;
  if (hasContext && hasQuestions && hasSteps) return "good";
  if (hasSteps) return "warn";
  return "weak";
}

const HEALTH_COLORS = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  weak: "bg-red-400",
};

const AUTONOMY_OPTIONS = [
  {
    value: "full_auto" as const,
    label: "Full Auto",
    icon: Zap,
    desc: "AI replies instantly to every message. Hands-free.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    activeBg: "bg-emerald-500",
  },
  {
    value: "suggest" as const,
    label: "Suggest",
    icon: Eye,
    desc: "AI drafts a reply — you review and send it.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800",
    activeBg: "bg-violet-500",
  },
  {
    value: "manual" as const,
    label: "Manual",
    icon: User,
    desc: "AI is off for this flow. You reply to every message.",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700",
    activeBg: "bg-slate-500",
  },
];

const BLANK_CONTEXT: FlowContext = {
  whoYouAre: "",
  whatOffering: "",
  whoTexting: "",
  clientGoals: "",
  agentName: "",
  companyName: "",
  contactReason: "",
  callbackNumber: "",
  website: "",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const [tab, setTab] = useState<Tab>("flows");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Flow | null>(null);
  const [creating, setCreating] = useState(false);

  // Create-flow form
  const [createName, setCreateName] = useState("");
  const [createContext, setCreateContext] = useState<FlowContext>({ ...BLANK_CONTEXT });
  const [createQuestions, setCreateQuestions] = useState<RequiredQuestion[]>([]);
  const [createAutonomy, setCreateAutonomy] = useState<"full_auto" | "suggest" | "manual">("full_auto");
  const [createRequiresCall, setCreateRequiresCall] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newQ, setNewQ] = useState({ question: "", fieldName: "" });

  // Edit-flow state (mirrors selected flow, dirty-tracked)
  const [editName, setEditName] = useState("");
  const [editContext, setEditContext] = useState<FlowContext>({ ...BLANK_CONTEXT });
  const [editQuestions, setEditQuestions] = useState<RequiredQuestion[]>([]);
  const [editAutonomy, setEditAutonomy] = useState<"full_auto" | "suggest" | "manual">("full_auto");
  const [editRequiresCall, setEditRequiresCall] = useState(false);
  const [editQ, setEditQ] = useState({ question: "", fieldName: "" });
  const [saving, setSaving] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ── Load flows ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFlows();
  }, []);

  async function fetchFlows() {
    setLoading(true);
    try {
      const res = await fetch("/api/flows");
      const data = await res.json();
      if (data.ok) {
        const mapped = (data.items || []).map(mapFlow);
        setFlows(mapped);
      }
    } catch {
      toast.error("Failed to load flows");
    } finally {
      setLoading(false);
    }
  }

  function mapFlow(raw: any): Flow {
    return {
      id: raw.id,
      name: raw.name,
      steps: raw.steps || [],
      requiredQuestions: raw.requiredQuestions || raw.required_questions || [],
      requiresCall: raw.requiresCall || raw.requires_call || false,
      autonomyMode: raw.autonomyMode || raw.context?.autonomyMode || "full_auto",
      context: raw.context || {},
      createdAt: raw.createdAt || raw.created_at,
      updatedAt: raw.updatedAt || raw.updated_at,
    };
  }

  // ── Select flow ─────────────────────────────────────────────────────────────
  function selectFlow(flow: Flow) {
    setSelected(flow);
    setCreating(false);
    setStepsOpen(false);
    setDirty(false);
    setEditName(flow.name);
    setEditContext({ ...BLANK_CONTEXT, ...flow.context });
    setEditQuestions(flow.requiredQuestions || []);
    setEditAutonomy(flow.autonomyMode || "full_auto");
    setEditRequiresCall(flow.requiresCall || false);
    setEditQ({ question: "", fieldName: "" });
  }

  // ── Save edits ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selected || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/flows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: editName.trim(),
          context: { ...editContext, autonomyMode: editAutonomy },
          requiredQuestions: editQuestions,
          requiresCall: editRequiresCall,
          autonomyMode: editAutonomy,
          steps: selected.steps,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      toast.success("Flow saved");
      await fetchFlows();
      const updated = { ...selected, name: editName.trim(), context: { ...editContext, autonomyMode: editAutonomy }, requiredQuestions: editQuestions, requiresCall: editRequiresCall, autonomyMode: editAutonomy };
      setSelected(updated);
      setDirty(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete flow ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this flow? This cannot be undone.")) return;
    try {
      await fetch(`/api/flows?id=${id}`, { method: "DELETE" });
      toast.success("Flow deleted");
      setSelected(null);
      setCreating(false);
      await fetchFlows();
    } catch {
      toast.error("Failed to delete flow");
    }
  }

  // ── Generate flow ───────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!createName.trim()) { toast.error("Flow name is required"); return; }
    if (!createContext.whoYouAre?.trim()) { toast.error("Tell us who you are"); return; }
    if (!createContext.whatOffering?.trim()) { toast.error("Tell us what you're offering"); return; }
    if (!createContext.whoTexting?.trim()) { toast.error("Tell us who you're texting"); return; }

    setGenerating(true);
    try {
      const res = await fetch("/api/generate-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowName: createName.trim(),
          context: createContext,
          requiredQuestions: createQuestions,
          requiresCall: createRequiresCall,
          autonomyMode: createAutonomy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast.success(`Flow created! ${data.pointsUsed} pts used`);
      await fetchFlows();
      // Select the new flow
      const newFlow: Flow = {
        id: data.flowId,
        name: createName.trim(),
        steps: data.steps || [],
        requiredQuestions: createQuestions,
        requiresCall: createRequiresCall,
        autonomyMode: createAutonomy,
        context: { ...createContext, autonomyMode: createAutonomy },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      resetCreate();
      selectFlow(newFlow);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate flow");
    } finally {
      setGenerating(false);
    }
  }

  // ── Create blank flow ───────────────────────────────────────────────────────
  async function handleCreateBlank() {
    if (!createName.trim()) { toast.error("Flow name is required"); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          context: { ...createContext, autonomyMode: createAutonomy },
          requiredQuestions: createQuestions,
          requiresCall: createRequiresCall,
          steps: [],
          autonomyMode: createAutonomy,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      toast.success("Flow created");
      await fetchFlows();
      resetCreate();
      // re-fetch and select
      const res2 = await fetch("/api/flows");
      const d2 = await res2.json();
      const all = (d2.items || []).map(mapFlow);
      const found = all.find((f: Flow) => f.id === data.data?.id);
      if (found) selectFlow(found);
    } catch (err: any) {
      toast.error(err.message || "Failed to create flow");
    } finally {
      setGenerating(false);
    }
  }

  function resetCreate() {
    setCreating(false);
    setCreateName("");
    setCreateContext({ ...BLANK_CONTEXT });
    setCreateQuestions([]);
    setCreateAutonomy("full_auto");
    setCreateRequiresCall(false);
    setNewQ({ question: "", fieldName: "" });
  }

  function markDirty() { setDirty(true); }

  // ── Add/remove questions helpers ────────────────────────────────────────────
  function addEditQ() {
    if (!editQ.question.trim() || !editQ.fieldName.trim()) { toast.error("Fill in both fields"); return; }
    setEditQuestions(prev => [...prev, { question: editQ.question.trim(), fieldName: editQ.fieldName.trim().replace(/\s+/g, "_").toLowerCase() }]);
    setEditQ({ question: "", fieldName: "" });
    markDirty();
  }

  function addCreateQ() {
    if (!newQ.question.trim() || !newQ.fieldName.trim()) { toast.error("Fill in both fields"); return; }
    setCreateQuestions(prev => [...prev, { question: newQ.question.trim(), fieldName: newQ.fieldName.trim().replace(/\s+/g, "_").toLowerCase() }]);
    setNewQ({ question: "", fieldName: "" });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Your AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Flows and receptionist settings</p>
        </div>
        <Link
          href="/demo"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
        >
          <FlaskConical className="w-4 h-4" />
          Test a Flow
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(["flows", "receptionist"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t === "flows" ? (
              <span className="flex items-center gap-1.5">
                <Bot className="w-4 h-4" />
                Flows
                {flows.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                    {flows.length}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Headphones className="w-4 h-4" />
                Receptionist
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Receptionist tab ── */}
      {tab === "receptionist" && (
        <ReceptionistSettings />
      )}

      {/* ── Flows tab ── */}
      {tab === "flows" && (
        <div className="grid grid-cols-12 gap-4" style={{ minHeight: "calc(100vh - 240px)" }}>
          {/* Left: flows list */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-2">
            <button
              onClick={() => { setCreating(true); setSelected(null); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Flow
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : flows.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bot className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No flows yet</p>
                <p className="text-xs text-slate-400 mt-1">Create your first flow above</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {flows.map(flow => {
                  const health = flowHealth(flow);
                  const isSelected = selected?.id === flow.id && !creating;
                  return (
                    <button
                      key={flow.id}
                      onClick={() => selectFlow(flow)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-700"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${HEALTH_COLORS[health]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{flow.name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              flow.autonomyMode === "full_auto"
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                : flow.autonomyMode === "suggest"
                                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                            }`}>
                              {flow.autonomyMode === "full_auto" ? "Auto" : flow.autonomyMode === "suggest" ? "Suggest" : "Manual"}
                            </span>
                            {flow.requiredQuestions?.length > 0 && (
                              <span className="text-xs text-slate-400">
                                {flow.requiredQuestions.length}Q
                              </span>
                            )}
                            {flow.steps?.length > 0 && (
                              <span className="text-xs text-slate-400">
                                {flow.steps.length} steps
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: detail / create panel */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9">
            {/* ── Create panel ── */}
            {creating && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-sky-500" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New Flow</h2>
                  </div>
                  <button onClick={resetCreate} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Flow Name</label>
                    <input
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      placeholder="e.g. Insurance Qualification"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                  </div>

                  {/* Identity */}
                  <Section title="Identity" subtitle="Tell the AI who it is and what it's doing">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ContextField icon={User} label="Who you are" placeholder="e.g. an insurance agent at ABC Insurance" value={createContext.whoYouAre || ""} onChange={v => setCreateContext(p => ({ ...p, whoYouAre: v }))} />
                      <ContextField icon={Target} label="What you're offering" placeholder="e.g. affordable health insurance plans" value={createContext.whatOffering || ""} onChange={v => setCreateContext(p => ({ ...p, whatOffering: v }))} />
                      <ContextField icon={MessageSquare} label="Who you're texting" placeholder="e.g. people who requested a quote online" value={createContext.whoTexting || ""} onChange={v => setCreateContext(p => ({ ...p, whoTexting: v }))} />
                      <ContextField icon={Target} label="Client goals" placeholder="e.g. find coverage that fits their budget" value={createContext.clientGoals || ""} onChange={v => setCreateContext(p => ({ ...p, clientGoals: v }))} />
                      <ContextField icon={User} label="Agent name" placeholder="e.g. Sarah" value={createContext.agentName || ""} onChange={v => setCreateContext(p => ({ ...p, agentName: v }))} />
                      <ContextField icon={Building2} label="Company name" placeholder="e.g. ABC Insurance" value={createContext.companyName || ""} onChange={v => setCreateContext(p => ({ ...p, companyName: v }))} />
                      <ContextField icon={MessageSquare} label="Why you're reaching out" placeholder="e.g. following up on their online quote request" value={createContext.contactReason || ""} onChange={v => setCreateContext(p => ({ ...p, contactReason: v }))} />
                      <ContextField icon={Phone} label="Callback number" placeholder="Optional" value={createContext.callbackNumber || ""} onChange={v => setCreateContext(p => ({ ...p, callbackNumber: v }))} />
                      <ContextField icon={Globe} label="Website" placeholder="Optional" value={createContext.website || ""} onChange={v => setCreateContext(p => ({ ...p, website: v }))} />
                    </div>
                  </Section>

                  {/* Required questions */}
                  <Section title="Required Questions" subtitle="The AI gathers these one at a time. When all are answered, the lead is tagged 'qualified'.">
                    <QuestionsEditor
                      questions={createQuestions}
                      onRemove={i => setCreateQuestions(prev => prev.filter((_, idx) => idx !== i))}
                      newQ={newQ}
                      setNewQ={setNewQ}
                      onAdd={addCreateQ}
                    />
                  </Section>

                  {/* Autonomy */}
                  <Section title="Autonomy Mode" subtitle="How much control does the AI have?">
                    <AutonomySelector value={createAutonomy} onChange={v => setCreateAutonomy(v)} />
                  </Section>

                  {/* Requires call */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={createRequiresCall} onChange={e => setCreateRequiresCall(e.target.checked)} className="w-4 h-4 rounded accent-sky-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Requires a phone call</p>
                      <p className="text-xs text-slate-400">The AI will move toward scheduling a call once questions are answered</p>
                    </div>
                  </label>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {generating ? "Generating…" : "Generate with AI (15 pts)"}
                    </button>
                    <button
                      onClick={handleCreateBlank}
                      disabled={generating}
                      className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
                    >
                      Start Blank
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Edit panel ── */}
            {selected && !creating && (
              <div className="space-y-4">
                {/* Flow name + actions bar */}
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3">
                  <input
                    value={editName}
                    onChange={e => { setEditName(e.target.value); markDirty(); }}
                    className="flex-1 text-lg font-semibold text-slate-900 dark:text-slate-100 bg-transparent outline-none border-b-2 border-transparent focus:border-sky-400 transition-colors py-0.5"
                  />
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/demo?flowId=${selected.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      Test
                    </Link>
                    <button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg transition-colors"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Identity */}
                <Card title="Identity" subtitle="Who the AI is and what it's doing">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <ContextField icon={User} label="Who you are" placeholder="e.g. an insurance agent at ABC Insurance" value={editContext.whoYouAre || ""} onChange={v => { setEditContext(p => ({ ...p, whoYouAre: v })); markDirty(); }} />
                    <ContextField icon={Target} label="What you're offering" placeholder="e.g. affordable health insurance plans" value={editContext.whatOffering || ""} onChange={v => { setEditContext(p => ({ ...p, whatOffering: v })); markDirty(); }} />
                    <ContextField icon={MessageSquare} label="Who you're texting" placeholder="e.g. people who requested a quote online" value={editContext.whoTexting || ""} onChange={v => { setEditContext(p => ({ ...p, whoTexting: v })); markDirty(); }} />
                    <ContextField icon={Target} label="Client goals" placeholder="e.g. find coverage that fits their budget" value={editContext.clientGoals || ""} onChange={v => { setEditContext(p => ({ ...p, clientGoals: v })); markDirty(); }} />
                    <ContextField icon={User} label="Agent name" placeholder="e.g. Sarah" value={editContext.agentName || ""} onChange={v => { setEditContext(p => ({ ...p, agentName: v })); markDirty(); }} />
                    <ContextField icon={Building2} label="Company name" placeholder="e.g. ABC Insurance" value={editContext.companyName || ""} onChange={v => { setEditContext(p => ({ ...p, companyName: v })); markDirty(); }} />
                    <ContextField icon={MessageSquare} label="Why you're reaching out" placeholder="e.g. following up on their online quote request" value={editContext.contactReason || ""} onChange={v => { setEditContext(p => ({ ...p, contactReason: v })); markDirty(); }} />
                    <ContextField icon={Phone} label="Callback number" placeholder="Optional" value={editContext.callbackNumber || ""} onChange={v => { setEditContext(p => ({ ...p, callbackNumber: v })); markDirty(); }} />
                    <ContextField icon={Globe} label="Website" placeholder="Optional" value={editContext.website || ""} onChange={v => { setEditContext(p => ({ ...p, website: v })); markDirty(); }} />
                  </div>
                </Card>

                {/* Required Questions — centerpiece */}
                <Card
                  title="Required Questions"
                  subtitle="The AI collects these one at a time during the conversation. When all are answered, the lead is automatically tagged 'qualified'."
                  accent
                >
                  <QuestionsEditor
                    questions={editQuestions}
                    onRemove={i => { setEditQuestions(prev => prev.filter((_, idx) => idx !== i)); markDirty(); }}
                    newQ={editQ}
                    setNewQ={setEditQ}
                    onAdd={addEditQ}
                  />
                </Card>

                {/* Autonomy */}
                <Card title="Autonomy Mode" subtitle="How much control does the AI have over replies?">
                  <AutonomySelector value={editAutonomy} onChange={v => { setEditAutonomy(v); markDirty(); }} />
                  <label className="flex items-center gap-3 cursor-pointer mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <input type="checkbox" checked={editRequiresCall} onChange={e => { setEditRequiresCall(e.target.checked); markDirty(); }} className="w-4 h-4 rounded accent-sky-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Requires a phone call</p>
                      <p className="text-xs text-slate-400">AI will move toward scheduling a call once all questions are answered</p>
                    </div>
                  </label>
                </Card>

                {/* Steps — collapsed preview */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setStepsOpen(v => !v)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Conversation Steps
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                        {selected.steps?.length || 0}
                      </span>
                    </div>
                    {stepsOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>

                  {stepsOpen && (
                    <div className="px-5 pb-5 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-4">
                      {!selected.steps?.length ? (
                        <p className="text-sm text-slate-400 text-center py-4">
                          No steps yet — generate the flow with AI to create them.
                        </p>
                      ) : (
                        selected.steps.map((step, i) => (
                          <StepPreview key={step.id} step={step} index={i} />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!selected && !creating && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center mb-4">
                  <Bot className="w-7 h-7 text-sky-500" />
                </div>
                <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">Select a flow</h2>
                <p className="text-sm text-slate-400 max-w-xs">
                  Pick a flow from the list to edit it, or create a new one.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Card({ title, subtitle, children, accent }: { title: string; subtitle?: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-2xl p-5 ${accent ? "border-sky-200 dark:border-sky-800" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ContextField({ icon: Icon, label, placeholder, value, onChange }: {
  icon: React.ElementType; label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
      />
    </div>
  );
}

function QuestionsEditor({ questions, onRemove, newQ, setNewQ, onAdd }: {
  questions: RequiredQuestion[];
  onRemove: (i: number) => void;
  newQ: { question: string; fieldName: string };
  setNewQ: (v: { question: string; fieldName: string }) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {questions.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          No questions yet — add one below
        </p>
      )}
      {questions.map((q, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800 dark:text-slate-100">{q.question}</p>
            <p className="text-xs font-mono text-slate-400 mt-0.5">→ saves as <span className="text-sky-500">{q.fieldName}</span></p>
          </div>
          <button onClick={() => onRemove(i)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-red-500 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Add new question */}
      <div className="flex gap-2 pt-1">
        <div className="flex-1 space-y-2">
          <input
            value={newQ.question}
            onChange={e => setNewQ({ ...newQ, question: e.target.value })}
            onKeyDown={e => e.key === "Enter" && onAdd()}
            placeholder="Question to ask (e.g. What's your household size?)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
          <input
            value={newQ.fieldName}
            onChange={e => setNewQ({ ...newQ, fieldName: e.target.value.replace(/\s+/g, "_").toLowerCase() })}
            onKeyDown={e => e.key === "Enter" && onAdd()}
            placeholder="Field name (e.g. household_size)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>
        <button
          onClick={onAdd}
          className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition-colors self-start mt-0 shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AutonomySelector({ value, onChange }: {
  value: "full_auto" | "suggest" | "manual";
  onChange: (v: "full_auto" | "suggest" | "manual") => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {AUTONOMY_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              active
                ? `${opt.bg} border-current ${opt.color}`
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <div className={`flex items-center gap-2 mb-1.5 ${active ? opt.color : "text-slate-500 dark:text-slate-400"}`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-semibold">{opt.label}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{opt.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

function StepPreview({ step, index }: { step: FlowStep; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
          {index + 1}
        </span>
        <p className="flex-1 text-sm text-slate-700 dark:text-slate-200 line-clamp-2">{step.yourMessage}</p>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
      </button>
      {open && step.responses && step.responses.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-slate-100 dark:border-slate-700 pt-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Response paths</p>
          {step.responses.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="shrink-0 font-medium text-slate-400">↳ {r.label}:</span>
              <span className="italic">{r.followUpMessage}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

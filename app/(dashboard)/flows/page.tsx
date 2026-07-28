'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Zap,
  Plus,
  Edit2,
  Trash2,
  Bot,
  Phone,
  Home,
  Briefcase,
  Sun,
  Wrench,
  Building,
  ArrowLeft,
  Save,
  X,
  MessageSquare,
  HelpCircle,
  Check,
  FlaskConical,
} from 'lucide-react';
import { FLOW_TEMPLATES, FlowTemplate } from '@/lib/flowTemplates';

// ─── Types ─────────────────────────────────────────────────────────────────

type RequiredQuestion = {
  question: string;
  fieldName: string;
  tagName?: string;
  aiInstruction?: string;
};

type FlowContext = {
  whoYouAre?: string;
  whatOffering?: string;
  whoTexting?: string;
  clientGoals?: string;
  agentName?: string;
  companyName?: string;
  contactReason?: string;
  autonomyMode?: string;
};

type Flow = {
  id: string;
  name: string;
  description?: string;
  steps?: any[];
  context?: FlowContext;
  requiredQuestions?: RequiredQuestion[];
  requiresCall?: boolean;
  autonomyMode?: string;
  created_at?: string;
  updated_at?: string;
};

type AutonomyMode = 'full_auto' | 'suggest' | 'manual';

// ─── Template Picker Config ────────────────────────────────────────────────

const TEMPLATE_OPTIONS = [
  { key: 'insurance', label: 'Insurance', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700' },
  { key: 'real_estate', label: 'Real Estate', icon: Home, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-700' },
  { key: 'solar', label: 'Solar', icon: Sun, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-700' },
  { key: 'roofing', label: 'Roofing', icon: Building, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-700' },
  { key: 'home_services', label: 'Home Services', icon: Wrench, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-700' },
  { key: 'scratch', label: 'Start from Scratch', icon: Plus, color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-700/50', border: 'border-slate-200 dark:border-slate-600' },
] as const;

const AUTONOMY_OPTIONS: { value: AutonomyMode; label: string; description: string }[] = [
  { value: 'full_auto', label: 'Full Auto', description: 'AI responds automatically without your review' },
  { value: 'suggest', label: 'Suggest Replies', description: 'AI drafts responses — you review and send' },
  { value: 'manual', label: 'Manual', description: 'AI off — you handle all replies yourself' },
];

// ─── Helper ────────────────────────────────────────────────────────────────

function emptyQuestion(): RequiredQuestion {
  return { question: '', fieldName: '', tagName: '', aiInstruction: '' };
}

/** Turns "Step 2 — Health Check" or a question into a camelCase field key. */
function slugifyFieldName(text: string): string {
  const words = text
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .slice(0, 40);
}

function autonomyBadge(mode?: string) {
  if (mode === 'suggest') return { label: 'Suggest Replies', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' };
  if (mode === 'manual') return { label: 'Manual', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  return { label: 'Full Auto', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const router = useRouter();

  // List state
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // View state: 'list' | 'pick-template' | 'editor'
  const [view, setView] = useState<'list' | 'pick-template' | 'editor'>('list');
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);

  // Editor form state
  const [formName, setFormName] = useState('');
  const [formOffering, setFormOffering] = useState('');
  const [formAutonomy, setFormAutonomy] = useState<AutonomyMode>('full_auto');
  const [formRequiresCall, setFormRequiresCall] = useState(false);
  const [formQuestions, setFormQuestions] = useState<RequiredQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [advancedSteps, setAdvancedSteps] = useState<Set<number>>(new Set());

  // Account industry (set during onboarding) — used to default a new flow's
  // starting template so steps correlate with the account's line of business
  const [accountIndustry, setAccountIndustry] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadFlows();
    loadAccountIndustry();
  }, []);

  async function loadAccountIndustry() {
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const raw = user?.user_metadata?.industry;
      if (raw) {
        setAccountIndustry(String(raw).toLowerCase().replace(/[\s\/]+/g, '_'));
      }
    } catch {
      // Non-fatal — falls back to the manual template picker
    }
  }

  async function loadFlows() {
    setLoading(true);
    try {
      const res = await fetch('/api/flows');
      const data = await res.json();
      if (data.ok) {
        setFlows(data.items || []);
      } else {
        toast.error(data.error || 'Failed to load flows');
      }
    } catch {
      toast.error('Failed to load flows');
    } finally {
      setLoading(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/flows?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        toast.success('Flow deleted');
        setFlows(prev => prev.filter(f => f.id !== id));
      } else {
        toast.error(data.error || 'Failed to delete flow');
      }
    } catch {
      toast.error('Failed to delete flow');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // ── Open Editor ─────────────────────────────────────────────────────────

  function openNewFlow() {
    setEditingFlow(null);
    // Default straight into the account's industry template when we have one —
    // still fully editable, and "Use a different starting point" in the editor
    // reaches the full picker for anyone who wants a different flow.
    if (accountIndustry && accountIndustry !== 'other' && (FLOW_TEMPLATES as any)[accountIndustry]) {
      selectTemplate(accountIndustry);
    } else {
      setView('pick-template');
    }
  }

  function openEditFlow(flow: Flow) {
    setEditingFlow(flow);
    populateForm(flow);
    setView('editor');
  }

  function populateForm(flow: Flow) {
    setFormName(flow.name || '');
    setFormOffering(flow.context?.whatOffering || flow.description || '');
    setFormAutonomy((flow.autonomyMode || flow.context?.autonomyMode || 'full_auto') as AutonomyMode);
    setFormRequiresCall(flow.requiresCall || false);
    setFormQuestions(flow.requiredQuestions && flow.requiredQuestions.length > 0 ? flow.requiredQuestions : []);
  }

  function selectTemplate(key: string) {
    if (key === 'scratch') {
      setFormName('');
      setFormOffering('');
      setFormAutonomy('full_auto');
      setFormRequiresCall(false);
      setFormQuestions([]);
    } else {
      const tmpl: FlowTemplate | undefined = (FLOW_TEMPLATES as any)[key];
      if (tmpl) {
        setFormName(tmpl.name);
        setFormOffering(tmpl.context.whatOffering || '');
        setFormAutonomy('full_auto');
        setFormRequiresCall(tmpl.requiresCall);
        setFormQuestions(tmpl.requiredQuestions || []);
      }
    }
    setView('editor');
  }

  // ── Save ────────────────────────────────────────────────────────────────

  /**
   * Persists the current editor state to /api/flows. Shared by "Save Flow"
   * (navigates back to the list) and "Test Flow" (a silent "soft save" that
   * stays in the editor and jumps into /demo instead).
   */
  async function persistFlow(): Promise<string | null> {
    if (!formName.trim()) {
      toast.error('Flow name is required');
      return null;
    }

    // Auto-generate any missing field names from the tag name / question text,
    // so "Advanced" never has to be opened just to satisfy this requirement
    const usedFieldNames = new Set<string>();
    const resolvedQuestions = formQuestions.map(q => {
      let fieldName = q.fieldName?.trim();
      if (!fieldName) {
        const base = slugifyFieldName(q.tagName || q.question) || 'field';
        fieldName = base;
        let n = 2;
        while (usedFieldNames.has(fieldName)) {
          fieldName = `${base}${n}`;
          n++;
        }
      }
      usedFieldNames.add(fieldName);
      return { ...q, fieldName };
    });

    const payload = {
      id: editingFlow?.id,
      name: formName.trim(),
      steps: [],
      context: {
        ...(editingFlow?.context || {}),
        whatOffering: formOffering,
        autonomyMode: formAutonomy,
      },
      requiredQuestions: resolvedQuestions,
      requiresCall: formRequiresCall,
      autonomyMode: formAutonomy,
    };

    const method = editingFlow ? 'PUT' : 'POST';
    const res = await fetch('/api/flows', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!data.ok) {
      toast.error(data.error || 'Failed to save flow');
      return null;
    }

    const savedId = editingFlow?.id || data.data?.id;
    // Soft-saves (Test Flow) leave editingFlow set so a second Test/Save
    // updates the same record instead of creating duplicates each time
    if (savedId && !editingFlow) {
      setEditingFlow({ id: savedId } as Flow);
    }
    return savedId || null;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const savedId = await persistFlow();
      if (savedId) {
        toast.success(editingFlow ? 'Flow updated' : 'Flow created');
        await loadFlows();
        setView('list');
      }
    } catch {
      toast.error('Failed to save flow');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestFlow() {
    setSaving(true);
    try {
      const savedId = await persistFlow();
      if (savedId) {
        router.push(`/demo?flowId=${savedId}`);
      }
    } catch {
      toast.error('Failed to save draft for testing');
    } finally {
      setSaving(false);
    }
  }

  // ── Question Helpers ────────────────────────────────────────────────────

  function updateQuestion(idx: number, patch: Partial<RequiredQuestion>) {
    setFormQuestions(prev => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setFormQuestions(prev => [...prev, emptyQuestion()]);
  }

  function removeQuestion(idx: number) {
    setFormQuestions(prev => prev.filter((_, i) => i !== idx));
    setAdvancedSteps(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Template Picker
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'pick-template') {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('list')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Choose a Starting Point</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Pick an industry template or start from scratch</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TEMPLATE_OPTIONS.map(({ key, label, icon: Icon, color, bg, border }) => (
            <button
              key={key}
              onClick={() => selectTemplate(key)}
              className={`relative card p-4 md:p-6 flex flex-col items-center gap-3 text-center hover:shadow-md transition-all border ${border} ${bg} cursor-pointer`}
            >
              {key === accountIndustry && (
                <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-600 text-white">
                  Your industry
                </span>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <span className={`text-sm font-medium ${color}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Flow Editor
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'editor') {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {editingFlow ? 'Edit Flow' : 'New Flow'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {editingFlow ? (
                  `Editing: ${editingFlow.name}`
                ) : (
                  <>
                    Configure your AI conversation flow
                    {accountIndustry && accountIndustry !== 'other' && (FLOW_TEMPLATES as any)[accountIndustry] && (
                      <>
                        {' · '}
                        <button
                          onClick={() => setView('pick-template')}
                          className="text-sky-600 dark:text-sky-400 hover:underline"
                        >
                          Use a different starting point
                        </button>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('list')}
              className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTestFlow}
              disabled={saving}
              title="Saves your current draft and opens it in the Flow Demo"
              className="border border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-violet-600 dark:text-violet-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              Test Flow
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Flow'}
            </button>
          </div>
        </div>

        {/* ── Section 1: Basic Info ── */}
        <div className="card p-4 md:p-6 mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-500" />
            Basic Info
          </h2>

          <div className="space-y-4">
            {/* Flow Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Flow Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Insurance Lead Qualification"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
              />
            </div>

            {/* What are you offering */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                What are you offering?
              </label>
              <textarea
                value={formOffering}
                onChange={e => setFormOffering(e.target.value)}
                placeholder="e.g. Health, Life, Auto, Home, and Commercial insurance"
                rows={2}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 resize-none"
              />
            </div>

            {/* Autonomy Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                AI Autonomy Mode
              </label>
              <div className="space-y-2">
                {AUTONOMY_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      formAutonomy === opt.value
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="autonomy"
                      value={opt.value}
                      checked={formAutonomy === opt.value}
                      onChange={() => setFormAutonomy(opt.value)}
                      className="mt-0.5 accent-sky-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{opt.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Requires Call toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Requires Phone Call</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Appointment will require a call, not just a text exchange</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormRequiresCall(prev => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  formRequiresCall ? 'bg-sky-600' : 'bg-slate-200 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    formRequiresCall ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>


        {/* ── Section 3: Pipeline Steps (Tags) ── */}
        <div className="card p-4 md:p-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-sky-500" />
              Pipeline Steps
            </h2>
            <button
              onClick={addQuestion}
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Step
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Each step below becomes a tag this lead is advanced through, one at a time, in order.
            The AI only works the current step until its question is answered, then moves to the next.
          </p>

          {formQuestions.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              No steps yet. Add one above.
            </div>
          ) : (
            <div className="space-y-3">
              {formQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Step {idx + 1}
                    </span>
                    <button
                      onClick={() => removeQuestion(idx)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove step"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Tag / step name
                      </label>
                      <input
                        type="text"
                        value={q.tagName || ''}
                        onChange={e => updateQuestion(idx, { tagName: e.target.value })}
                        placeholder='e.g. "Step 2 — Health Check"'
                        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        What should the AI ask or find out here?
                      </label>
                      <textarea
                        value={q.question}
                        onChange={e => updateQuestion(idx, { question: e.target.value })}
                        placeholder="e.g. Ask for their date of birth naturally, and explain it's needed for an accurate quote."
                        rows={2}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 resize-none"
                      />
                    </div>

                    <button
                      onClick={() =>
                        setAdvancedSteps(prev => {
                          const next = new Set(prev);
                          next.has(idx) ? next.delete(idx) : next.add(idx);
                          return next;
                        })
                      }
                      className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      {advancedSteps.has(idx) ? 'Hide' : 'Show'} advanced options
                    </button>

                    {advancedSteps.has(idx) && (
                      <div className="space-y-3 pt-1 pl-3 border-l-2 border-slate-100 dark:border-slate-700">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Field name
                            <span className="ml-1 font-normal text-slate-400">(auto-generated if left blank)</span>
                          </label>
                          <input
                            type="text"
                            value={q.fieldName}
                            onChange={e => updateQuestion(idx, { fieldName: e.target.value })}
                            placeholder={slugifyFieldName(q.tagName || q.question) || 'fieldName'}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Override how the AI phrases this
                            <span className="ml-1 font-normal text-slate-400">(only needed if it should differ from what's above — used in conversation, while the field above is used to extract the answer)</span>
                          </label>
                          <textarea
                            value={q.aiInstruction || ''}
                            onChange={e => updateQuestion(idx, { aiInstruction: e.target.value })}
                            placeholder="Leave blank to reuse the text above"
                            rows={2}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom save bar */}
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-end gap-2">
          <button
            onClick={() => setView('list')}
            className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTestFlow}
            disabled={saving}
            title="Saves your current draft and opens it in the Flow Demo"
            className="border border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-violet-600 dark:text-violet-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <FlaskConical className="w-4 h-4" />
            Test Flow
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Flow'}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Flow List
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-6 h-6 text-sky-500" />
            AI Flows
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Conversation templates that qualify leads and book appointments
          </p>
        </div>
        <button
          onClick={openNewFlow}
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Flow
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(n => (
            <div key={n} className="card p-4 md:p-6 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-3" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/5 mb-4" />
              <div className="flex gap-2">
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-16" />
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && flows.length === 0 && (
        <div className="card p-8 md:p-12 text-center max-w-md mx-auto mt-8">
          <div className="w-16 h-16 bg-sky-50 dark:bg-sky-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-sky-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No flows yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Create your first flow to start qualifying leads automatically with AI-powered conversations.
          </p>
          <button
            onClick={openNewFlow}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mx-auto transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Flow
          </button>
        </div>
      )}

      {/* Flow Cards Grid */}
      {!loading && flows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {flows.map(flow => {
            const badge = autonomyBadge(flow.autonomyMode || flow.context?.autonomyMode);
            const stepCount = flow.steps?.length || 0;
            const questionCount = flow.requiredQuestions?.length || 0;
            const description = flow.context?.whatOffering || flow.description || '';
            const isConfirmingDelete = confirmDeleteId === flow.id;
            const isDeleting = deletingId === flow.id;

            return (
              <div key={flow.id} className="card p-4 md:p-6 flex flex-col gap-3">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug flex-1">
                    {flow.name}
                  </h3>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditFlow(flow)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      title="Edit flow"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 ml-1">
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">Delete?</span>
                        <button
                          onClick={() => handleDelete(flow.id)}
                          disabled={isDeleting}
                          className="px-2 py-1 rounded text-xs bg-transparent border border-red-500/50 text-red-500 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? '…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded text-xs border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(flow.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete flow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                {description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {description}
                  </p>
                )}

                {/* Badges row */}
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {/* Autonomy mode */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                    <Zap className="w-3 h-3" />
                    {badge.label}
                  </span>

                  {/* Step count */}
                  {stepCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      <MessageSquare className="w-3 h-3" />
                      {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                    </span>
                  )}

                  {/* Required questions */}
                  {questionCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      <HelpCircle className="w-3 h-3" />
                      {questionCount} required {questionCount === 1 ? 'field' : 'fields'}
                    </span>
                  )}

                  {/* Requires call */}
                  {flow.requiresCall && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      <Phone className="w-3 h-3" />
                      Requires call
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

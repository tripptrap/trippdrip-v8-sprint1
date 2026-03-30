'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { FLOW_TEMPLATES, FlowTemplate } from '@/lib/flowTemplates';

// ─── Types ─────────────────────────────────────────────────────────────────

type ResponseOption = {
  label: string;
  followUpMessage: string;
  nextStepId?: string;
  action?: 'continue' | 'end';
};

type FlowStep = {
  id: string;
  yourMessage: string;
  responses: ResponseOption[];
  tag?: { label: string; color: string };
};

type RequiredQuestion = {
  question: string;
  fieldName: string;
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
  steps: FlowStep[];
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

function newStepId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyStep(): FlowStep {
  return {
    id: newStepId(),
    yourMessage: '',
    responses: [
      { label: '', followUpMessage: '' },
      { label: '', followUpMessage: '' },
    ],
  };
}

function emptyQuestion(): RequiredQuestion {
  return { question: '', fieldName: '' };
}

function autonomyBadge(mode?: string) {
  if (mode === 'suggest') return { label: 'Suggest Replies', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' };
  if (mode === 'manual') return { label: 'Manual', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  return { label: 'Full Auto', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FlowsPage() {
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
  const [formSteps, setFormSteps] = useState<FlowStep[]>([emptyStep()]);
  const [formQuestions, setFormQuestions] = useState<RequiredQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadFlows();
  }, []);

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
    setView('pick-template');
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
    setFormSteps(
      flow.steps && flow.steps.length > 0
        ? flow.steps.map(s => ({
            ...s,
            responses: s.responses && s.responses.length > 0 ? s.responses : [{ label: '', followUpMessage: '' }],
          }))
        : [emptyStep()]
    );
    setFormQuestions(flow.requiredQuestions && flow.requiredQuestions.length > 0 ? flow.requiredQuestions : []);
  }

  function selectTemplate(key: string) {
    if (key === 'scratch') {
      setFormName('');
      setFormOffering('');
      setFormAutonomy('full_auto');
      setFormRequiresCall(false);
      setFormSteps([emptyStep()]);
      setFormQuestions([]);
    } else {
      const tmpl: FlowTemplate | undefined = (FLOW_TEMPLATES as any)[key];
      if (tmpl) {
        setFormName(tmpl.name);
        setFormOffering(tmpl.context.whatOffering || '');
        setFormAutonomy('full_auto');
        setFormRequiresCall(tmpl.requiresCall);
        setFormSteps(
          tmpl.steps.map(s => ({
            ...s,
            responses: s.responses || [],
          }))
        );
        setFormQuestions(tmpl.requiredQuestions || []);
      }
    }
    setView('editor');
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!formName.trim()) {
      toast.error('Flow name is required');
      return;
    }
    if (formSteps.length === 0) {
      toast.error('At least one step is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editingFlow?.id,
        name: formName.trim(),
        steps: formSteps,
        context: {
          ...(editingFlow?.context || {}),
          whatOffering: formOffering,
          autonomyMode: formAutonomy,
        },
        requiredQuestions: formQuestions,
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

      if (data.ok) {
        toast.success(editingFlow ? 'Flow updated' : 'Flow created');
        await loadFlows();
        setView('list');
      } else {
        toast.error(data.error || 'Failed to save flow');
      }
    } catch {
      toast.error('Failed to save flow');
    } finally {
      setSaving(false);
    }
  }

  // ── Step Helpers ────────────────────────────────────────────────────────

  function updateStep(idx: number, patch: Partial<FlowStep>) {
    setFormSteps(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setFormSteps(prev => [...prev, emptyStep()]);
  }

  function removeStep(idx: number) {
    if (formSteps.length <= 1) return;
    setFormSteps(prev => prev.filter((_, i) => i !== idx));
  }

  function updateResponse(stepIdx: number, respIdx: number, patch: Partial<ResponseOption>) {
    setFormSteps(prev =>
      prev.map((s, i) => {
        if (i !== stepIdx) return s;
        return {
          ...s,
          responses: s.responses.map((r, j) => (j === respIdx ? { ...r, ...patch } : r)),
        };
      })
    );
  }

  function addResponse(stepIdx: number) {
    setFormSteps(prev =>
      prev.map((s, i) => {
        if (i !== stepIdx) return s;
        if (s.responses.length >= 4) return s;
        return { ...s, responses: [...s.responses, { label: '', followUpMessage: '' }] };
      })
    );
  }

  function removeResponse(stepIdx: number, respIdx: number) {
    setFormSteps(prev =>
      prev.map((s, i) => {
        if (i !== stepIdx) return s;
        if (s.responses.length <= 1) return s;
        return { ...s, responses: s.responses.filter((_, j) => j !== respIdx) };
      })
    );
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
              className={`card p-4 md:p-6 flex flex-col items-center gap-3 text-center hover:shadow-md transition-all border ${border} ${bg} cursor-pointer`}
            >
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
                {editingFlow ? `Editing: ${editingFlow.name}` : 'Configure your AI conversation flow'}
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

        {/* ── Section 2: Conversation Steps ── */}
        <div className="card p-4 md:p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-500" />
              Conversation Steps
            </h2>
          </div>

          <div className="space-y-5">
            {formSteps.map((step, sIdx) => (
              <div
                key={step.id}
                className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                {/* Step header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Step {sIdx + 1}
                  </span>
                  {formSteps.length > 1 && (
                    <button
                      onClick={() => removeStep(sIdx)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove step"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* AI Message */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Your Message
                      <span className="ml-1 text-xs font-normal text-slate-400">(what the AI sends)</span>
                    </label>
                    <textarea
                      value={step.yourMessage}
                      onChange={e => updateStep(sIdx, { yourMessage: e.target.value })}
                      placeholder="Hi! I'm reaching out because you expressed interest in..."
                      rows={3}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 resize-none"
                    />
                  </div>

                  {/* Response Options */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Response Options
                        <span className="ml-1 text-xs font-normal text-slate-400">({step.responses.length}/4)</span>
                      </label>
                      {step.responses.length < 4 && (
                        <button
                          onClick={() => addResponse(sIdx)}
                          className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Response
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {step.responses.map((resp, rIdx) => (
                        <div key={rIdx} className="flex gap-2 items-start">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={resp.label}
                              onChange={e => updateResponse(sIdx, rIdx, { label: e.target.value })}
                              placeholder="Button label"
                              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
                            />
                            <input
                              type="text"
                              value={resp.followUpMessage}
                              onChange={e => updateResponse(sIdx, rIdx, { followUpMessage: e.target.value })}
                              placeholder="Follow-up message"
                              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
                            />
                          </div>
                          {step.responses.length > 1 && (
                            <button
                              onClick={() => removeResponse(sIdx, rIdx)}
                              className="mt-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addStep}
            className="mt-4 w-full py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Step
          </button>
        </div>

        {/* ── Section 3: Required Questions ── */}
        <div className="card p-4 md:p-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-sky-500" />
              Required Questions
            </h2>
            <button
              onClick={addQuestion}
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Question
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            The AI will make sure to collect answers to these questions before booking an appointment.
          </p>

          {formQuestions.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              No required questions yet. Add one above.
            </div>
          ) : (
            <div className="space-y-2">
              {formQuestions.map((q, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={q.question}
                      onChange={e => updateQuestion(idx, { question: e.target.value })}
                      placeholder="Question text"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
                    />
                    <input
                      type="text"
                      value={q.fieldName}
                      onChange={e => updateQuestion(idx, { fieldName: e.target.value })}
                      placeholder="field_name (snake_case)"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 font-mono"
                    />
                  </div>
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="mt-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
                          className="px-2 py-1 rounded text-xs bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
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

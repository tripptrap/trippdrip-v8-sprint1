'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ReceptionistSettings as ReceptionistSettingsType,
  ReceptionistIdentity,
  DEFAULT_RECEPTIONIST_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
} from '@/lib/receptionist/types';
import {
  Headphones, MessageSquare, Clock, Users, Calendar, Zap,
  Shield, Bot, Building2, Phone, Globe, MapPin, Sparkles,
  CheckCircle2, AlertCircle, Info,
} from 'lucide-react';

// ─── constants ───────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix',     label: 'Arizona (MST)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HST)' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const INDUSTRIES = [
  { value: '',                    label: 'No industry preset (custom only)' },
  { value: 'insurance',           label: 'Insurance' },
  { value: 'real_estate',         label: 'Real Estate' },
  { value: 'solar',               label: 'Solar' },
  { value: 'roofing',             label: 'Roofing' },
  { value: 'home_services',       label: 'Home Services' },
  { value: 'financial_services',  label: 'Financial Services' },
  { value: 'healthcare',          label: 'Healthcare' },
  { value: 'automotive',          label: 'Automotive' },
  { value: 'retail',              label: 'Retail' },
  { value: 'other',               label: 'Other' },
];

// ─── small helpers ────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, size = 'md',
}: { checked: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-11 h-6' : 'w-14 h-7';
  const dot = size === 'sm'
    ? 'after:h-5 after:w-5 after:top-[2px] after:left-[2px]'
    : 'after:h-6 after:w-6 after:top-0.5 after:left-[4px]';
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className={`${w} bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:bg-white after:border-slate-300 after:border after:rounded-full after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-sky-500 peer-checked:to-teal-500 ${dot}`} />
    </label>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({
  icon, iconBg, title, subtitle, right,
}: {
  icon: React.ReactNode; iconBg: string; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function Field({
  label, hint, icon, children,
}: { label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {icon && <span className="inline-flex mr-1.5 opacity-60">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function Input({
  value, onChange, placeholder, className = '',
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-colors ${className}`}
    />
  );
}

// ─── identity health check ────────────────────────────────────────────────────

function identityCompleteness(id: ReceptionistIdentity): 'complete' | 'partial' | 'empty' {
  const filled = [id.agentName, id.businessName, id.whatYouOffer].filter(Boolean).length;
  if (filled === 3) return 'complete';
  if (filled > 0)  return 'partial';
  return 'empty';
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ReceptionistSettings() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [hasSettings, setHasSettings] = useState(false);

  // top-level toggle (auto-saves)
  const [enabled, setEnabled]   = useState(false);

  // identity
  const [identity, setIdentityRaw] = useState<ReceptionistIdentity>({});

  // personality
  const [industry, setIndustry]               = useState<string>('');
  const [useIndustryPreset, setUsePreset]     = useState(true);
  const [systemPrompt, setSystemPrompt]       = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');

  // business hours
  const [hoursEnabled, setHoursEnabled]       = useState(true);
  const [hoursStart, setHoursStart]           = useState('09:00');
  const [hoursEnd, setHoursEnd]               = useState('17:00');
  const [hoursTz, setHoursTz]                 = useState('America/New_York');
  const [businessDays, setBusinessDays]       = useState<number[]>([1, 2, 3, 4, 5]);
  const [afterHours, setAfterHours]           = useState('');

  // response settings
  const [respondClients, setRespondClients]   = useState(true);
  const [respondNew, setRespondNew]           = useState(true);
  const [autoCreate, setAutoCreate]           = useState(true);

  // calendar
  const [calendarEnabled, setCalendarEnabled] = useState(false);

  // ── helpers ──────────────────────────────────────────────────────────────────

  const setIdentity = useCallback((patch: Partial<ReceptionistIdentity>) => {
    setIdentityRaw(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const markDirty = useCallback((fn: () => void) => {
    fn();
    setDirty(true);
  }, []);

  // ── load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch('/api/receptionist/settings');
        const data = await res.json();
        if (!data.success) return;
        const s = data.settings;
        setHasSettings(data.hasSettings);
        setEnabled(s.enabled ?? false);
        setIdentityRaw(s.identity ?? {});
        setSystemPrompt(s.system_prompt ?? '');
        setGreetingMessage(s.greeting_message ?? DEFAULT_RECEPTIONIST_SETTINGS.greeting_message ?? '');
        setHoursEnabled(s.business_hours_enabled ?? true);
        setHoursStart(s.business_hours_start?.substring(0, 5) ?? '09:00');
        setHoursEnd(s.business_hours_end?.substring(0, 5) ?? '17:00');
        setHoursTz(s.business_hours_timezone ?? 'America/New_York');
        setBusinessDays(s.business_days ?? [1, 2, 3, 4, 5]);
        setAfterHours(s.after_hours_message ?? '');
        setRespondClients(s.respond_to_sold_clients ?? true);
        setRespondNew(s.respond_to_new_contacts ?? true);
        setAutoCreate(s.auto_create_leads ?? true);
        setCalendarEnabled(s.calendar_enabled ?? false);
        setIndustry(s.industry ?? '');
        setUsePreset(s.use_industry_preset ?? true);
      } catch {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
        setDirty(false);
      }
    })();
  }, []);

  // ── save ──────────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/receptionist/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          identity,
          system_prompt: systemPrompt || null,
          greeting_message: greetingMessage,
          business_hours_enabled: hoursEnabled,
          business_hours_start: hoursStart + ':00',
          business_hours_end:   hoursEnd   + ':00',
          business_hours_timezone: hoursTz,
          business_days: businessDays,
          after_hours_message: afterHours || null,
          respond_to_sold_clients: respondClients,
          respond_to_new_contacts: respondNew,
          auto_create_leads: autoCreate,
          calendar_enabled: calendarEnabled,
          industry: industry || null,
          use_industry_preset: useIndustryPreset,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Settings saved');
        setHasSettings(true);
        setDirty(false);
      } else if (data.upgradeRequired) {
        toast.error('Paid subscription required');
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveToggle = async (val: boolean) => {
    try {
      const res = await fetch('/api/receptionist/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: val }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Receptionist ${val ? 'enabled' : 'disabled'}`);
        setHasSettings(true);
      } else if (data.upgradeRequired) {
        setEnabled(!val);
        toast.error('A paid plan is required to enable the Receptionist.');
      } else {
        setEnabled(!val);
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      setEnabled(!val);
      toast.error('Failed to update');
    }
  };

  const toggleDay = (day: number) => {
    markDirty(() => setBusinessDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    ));
  };

  // ── render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  const idStatus = identityCompleteness(identity);

  return (
    <div className="space-y-5">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Receptionist Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Configure how your AI responds to inbound messages</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shadow-sm"
        >
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      {/* ── Enable toggle ── */}
      <Card className="bg-gradient-to-br from-sky-50 to-teal-50 dark:from-sky-900/20 dark:to-teal-900/20 border-sky-200 dark:border-sky-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">AI Receptionist</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Auto-respond to inbound texts from leads and clients
              </p>
            </div>
          </div>
          <Toggle checked={enabled} onChange={v => { setEnabled(v); saveToggle(v); }} />
        </div>
        {enabled && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Receptionist is active and responding to incoming messages
          </div>
        )}
      </Card>

      {/* ── Identity ── */}
      <Card className={
        idStatus === 'empty'
          ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-900/5'
          : idStatus === 'partial'
            ? 'border-violet-200 dark:border-violet-700/50'
            : 'border-violet-200 dark:border-violet-700/50'
      }>
        <CardHeader
          icon={<Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-100 dark:bg-violet-900/40"
          title="AI Identity"
          subtitle="Who the AI says it is — agent name, business, what you offer"
          right={
            idStatus === 'empty' ? (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Required
              </span>
            ) : idStatus === 'complete' ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Complete
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-violet-500 font-medium">
                <Info className="w-3.5 h-3.5" /> Partial
              </span>
            )
          }
        />

        {idStatus === 'empty' && (
          <div className="mb-5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
            <strong>Fill this in first.</strong> Without identity info, the AI can't answer "who are you?", "who do you work for?", or "what do you want?" — common questions from every lead.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Agent / AI Name"
            hint='What the AI calls itself. e.g. "Alex" or "Sarah from ABC Insurance"'
            icon={<Bot className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.agentName ?? ''}
              onChange={v => setIdentity({ agentName: v })}
              placeholder='e.g. "Alex"'
            />
          </Field>

          <Field
            label="Business Name"
            hint="The company / agency the AI works for"
            icon={<Building2 className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.businessName ?? ''}
              onChange={v => setIdentity({ businessName: v })}
              placeholder='e.g. "Smith Insurance Group"'
            />
          </Field>

          <Field
            label="What You Offer"
            hint='One-liner about your product/service. e.g. "Affordable health, life, and auto insurance for families"'
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.whatYouOffer ?? ''}
              onChange={v => setIdentity({ whatYouOffer: v })}
              placeholder='e.g. "Affordable health and life insurance for Texas families"'
              className="md:col-span-2"
            />
          </Field>

          <Field
            label="Who You Help"
            hint='Target audience. e.g. "Homeowners ages 30–65 in the Southeast"'
            icon={<Users className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.targetAudience ?? ''}
              onChange={v => setIdentity({ targetAudience: v })}
              placeholder='e.g. "Families and individuals looking for coverage"'
            />
          </Field>

          <Field
            label="Service Area"
            hint="Where you operate / states you serve"
            icon={<MapPin className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.serviceArea ?? ''}
              onChange={v => setIdentity({ serviceArea: v })}
              placeholder='e.g. "Texas, Oklahoma, and Louisiana"'
            />
          </Field>

          <Field
            label="Phone to Give Out"
            hint="Number to share if someone asks to call"
            icon={<Phone className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.callbackPhone ?? ''}
              onChange={v => setIdentity({ callbackPhone: v })}
              placeholder='e.g. "555-0100"'
            />
          </Field>

          <Field
            label="Website"
            hint="Optional — share when relevant"
            icon={<Globe className="w-3.5 h-3.5" />}
          >
            <Input
              value={identity.website ?? ''}
              onChange={v => setIdentity({ website: v })}
              placeholder='e.g. "smithinsurance.com"'
            />
          </Field>
        </div>

        {/* Preview */}
        {(identity.agentName || identity.businessName || identity.whatYouOffer) && (
          <div className="mt-5 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50 rounded-xl">
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-2 uppercase tracking-wide">AI Introduction Preview</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 italic">
              "
              {identity.agentName ? `Hi, I'm ${identity.agentName}` : 'Hi'}
              {identity.businessName ? ` with ${identity.businessName}` : ''}
              {identity.whatYouOffer ? ` — ${identity.whatYouOffer}.` : '.'}
              {identity.targetAudience ? ` We work with ${identity.targetAudience}.` : ''}
              "
            </p>
          </div>
        )}
      </Card>

      {/* ── Personality ── */}
      <Card>
        <CardHeader
          icon={<MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-100 dark:bg-indigo-900/40"
          title="Personality & Tone"
          subtitle="How the AI communicates — industry preset + custom rules"
        />

        <div className="space-y-4">
          <Field label="Industry Preset" hint="Loads a built-in personality and rules tuned for your industry">
            <select
              value={industry}
              onChange={e => markDirty(() => setIndustry(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {INDUSTRIES.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </Field>

          {industry && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox" checked={useIndustryPreset}
                onChange={e => markDirty(() => setUsePreset(e.target.checked))}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Use industry preset as base (extra instructions below are added on top)
              </span>
            </label>
          )}

          <Field
            label={industry && useIndustryPreset ? 'Extra Instructions' : 'Custom Instructions'}
            hint={industry && useIndustryPreset
              ? 'Anything specific beyond the industry preset — objection handling, special offers, rules for your business.'
              : 'Full description of how the AI should behave. Leave blank to use the default prompt.'}
          >
            <textarea
              value={systemPrompt}
              onChange={e => markDirty(() => setSystemPrompt(e.target.value))}
              placeholder={industry && useIndustryPreset
                ? 'Optional — e.g. "Always mention we have a same-day inspection guarantee."'
                : DEFAULT_SYSTEM_PROMPT}
              rows={5}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 resize-none"
            />
          </Field>

          <Field
            label="Greeting — First Message to New Contacts"
            hint="Sent the very first time someone texts your number"
          >
            <input
              type="text"
              value={greetingMessage}
              onChange={e => markDirty(() => setGreetingMessage(e.target.value))}
              placeholder="Hi! Thanks for reaching out. How can I help you today?"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </Field>
        </div>
      </Card>

      {/* ── Business Hours ── */}
      <Card>
        <CardHeader
          icon={<Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          title="Business Hours"
          subtitle="When to reply normally vs. send an after-hours message"
          right={<Toggle size="sm" checked={hoursEnabled} onChange={v => markDirty(() => setHoursEnabled(v))} />}
        />

        {hoursEnabled && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Start Time</label>
                <input type="time" value={hoursStart}
                  onChange={e => markDirty(() => setHoursStart(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">End Time</label>
                <input type="time" value={hoursEnd}
                  onChange={e => markDirty(() => setHoursEnd(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Timezone</label>
                <select value={hoursTz} onChange={e => markDirty(() => setHoursTz(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Business Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS_OF_WEEK.map(day => (
                  <button key={day.value} type="button" onClick={() => toggleDay(day.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      businessDays.includes(day.value)
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}>
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="After-Hours Message" hint="Sent automatically when someone texts outside your hours">
              <textarea value={afterHours}
                onChange={e => markDirty(() => setAfterHours(e.target.value))}
                placeholder="Thanks for reaching out! We're currently closed. We'll get back to you during business hours."
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
            </Field>
          </div>
        )}
      </Card>

      {/* ── Response Rules ── */}
      <Card>
        <CardHeader
          icon={<Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
          iconBg="bg-sky-100 dark:bg-sky-900/40"
          title="Response Rules"
          subtitle="Who the receptionist responds to"
        />
        <div className="space-y-3">
          {[
            {
              label: 'Respond to Existing Clients',
              desc: 'Auto-reply to leads you\'ve marked as sold / active clients',
              val: respondClients, set: (v: boolean) => markDirty(() => setRespondClients(v)),
            },
            {
              label: 'Respond to New Contacts',
              desc: 'Auto-reply when an unknown number texts your line',
              val: respondNew, set: (v: boolean) => markDirty(() => setRespondNew(v)),
            },
            {
              label: 'Auto-Create Lead Record',
              desc: 'Automatically create a lead entry for new contacts who text you',
              val: autoCreate, set: (v: boolean) => markDirty(() => setAutoCreate(v)),
            },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.desc}</p>
              </div>
              <Toggle size="sm" checked={row.val} onChange={row.set} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Calendar ── */}
      <Card>
        <CardHeader
          icon={<Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          title="Calendar Integration"
          subtitle="Let the receptionist help contacts schedule appointments"
          right={<Toggle size="sm" checked={calendarEnabled} onChange={v => markDirty(() => setCalendarEnabled(v))} />}
        />
        {calendarEnabled && (
          <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg text-sm text-sky-700 dark:text-sky-400">
            Make sure you've connected your Google Calendar in{' '}
            <a href="/integrations" className="underline font-medium">Integrations</a>.
          </div>
        )}
      </Card>

      {/* ── Usage ── */}
      <Card>
        <CardHeader
          icon={<Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
          iconBg="bg-purple-100 dark:bg-purple-900/40"
          title="Credit Usage"
          subtitle="How many points each receptionist action costs"
        />
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'AI response',            value: '2 pts', color: 'sky' },
            { label: 'After-hours message',     value: 'Free',  color: 'emerald' },
            { label: 'SMS send',               value: '1 pt',  color: 'amber' },
          ].map(item => (
            <div key={item.label}
              className={`p-4 rounded-xl text-center bg-${item.color}-50 dark:bg-${item.color}-900/20 border border-${item.color}-200 dark:border-${item.color}-700/50`}>
              <div className={`text-2xl font-bold text-${item.color}-600 dark:text-${item.color}-400`}>{item.value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Each AI reply = 2 pts (generation) + 1 pt (SMS). After-hours static messages are only 1 pt.
        </p>
      </Card>

      {/* ── Bottom save ── */}
      <div className="flex justify-end pb-6">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 shadow-sm"
        >
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'All Saved'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Link2, Link as LinkIcon } from 'lucide-react';
import { generateCampaignDefaults, CampaignDefaults } from '@/lib/telnyx10dlcDefaults';

type EntityType = 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT' | 'GOVERNMENT' | 'SOLE_PROPRIETOR';

type Registration = {
  id: string;
  entity_type: EntityType;
  legal_business_name: string;
  display_name: string;
  vertical: string;
  brand_id: string | null;
  brand_status: 'not_started' | 'pending' | 'verified' | 'failed';
  brand_failure_reason: string | null;
  campaign_id: string | null;
  campaign_status: 'not_started' | 'pending' | 'active' | 'failed';
  campaign_failure_reason: string | null;
  assigned_phone_number: string | null;
};

// Confirmed against Telnyx's live enum endpoint (GET /v2/10dlc/enum/vertical,
// 2026-07-27) — free-text here caused avoidable risk of invalid submissions.
const VERTICAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'FINANCIAL', label: 'Financial Services' },
  { value: 'HEALTHCARE', label: 'Healthcare and Life Sciences' },
  { value: 'CONSTRUCTION', label: 'Construction, Materials & Trade Services' },
  { value: 'ENERGY', label: 'Energy and Utilities' },
  { value: 'RETAIL', label: 'Retail and Consumer Products' },
  { value: 'PROFESSIONAL', label: 'Professional Services' },
  { value: 'TECHNOLOGY', label: 'Information Technology Services' },
  { value: 'HOSPITALITY', label: 'Hospitality and Travel' },
  { value: 'TRANSPORTATION', label: 'Transportation or Logistics' },
  { value: 'AGRICULTURE', label: 'Agriculture' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'COMMUNICATION', label: 'Media and Communication' },
  { value: 'ENTERTAINMENT', label: 'Entertainment' },
  { value: 'HUMAN_RESOURCES', label: 'HR, Staffing or Recruitment' },
  { value: 'POSTAL', label: 'Postal and Delivery' },
  { value: 'NGO', label: 'Non-profit Organization' },
  { value: 'GOVERNMENT', label: 'Government Services and Agencies' },
];

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'PRIVATE_PROFIT', label: 'Private for-profit company' },
  { value: 'PUBLIC_PROFIT', label: 'Public for-profit company' },
  { value: 'NON_PROFIT', label: 'Non-profit' },
  { value: 'GOVERNMENT', label: 'Government entity' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole proprietor (no EIN)' },
];

function statusPill(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    pending: { label: 'Pending review', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
    verified: { label: 'Verified', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    active: { label: 'Active', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    failed: { label: 'Rejected', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  };
  const s = map[status] || map.not_started;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export default function TenDLCRegistration() {
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [overrides, setOverrides] = useState<Partial<CampaignDefaults>>({});

  const [optInUrl, setOptInUrl] = useState<string | null>(null);
  const [needsBusinessName, setNeedsBusinessName] = useState(false);
  const [copied, setCopied] = useState(false);

  const [entityType, setEntityType] = useState<EntityType>('PRIVATE_PROFIT');
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [vertical, setVertical] = useState('');
  const [whatTheyOffer, setWhatTheyOffer] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  useEffect(() => {
    loadStatus();
    loadOptInLink();
  }, []);

  async function loadOptInLink() {
    try {
      const res = await fetch('/api/opt-in/my-link');
      const data = await res.json();
      if (data.ok) {
        setOptInUrl(data.url);
        setNeedsBusinessName(!!data.needsBusinessName);
      }
    } catch {
      // Non-fatal — the form still works, the URL just won't be prefilled
    }
  }

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/telnyx/10dlc/status');
      const data = await res.json();
      if (data.ok) {
        setRegistration(data.registration);
        if (data.registration) {
          setLegalBusinessName(data.registration.legal_business_name || '');
          setDisplayName(data.registration.display_name || '');
          setVertical(data.registration.vertical || '');
        }
      }
    } catch {
      toast.error('Failed to load 10DLC registration status');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/telnyx/10dlc/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setRegistration(data.registration);
        toast.success('Status refreshed');
      } else {
        toast.error(data.error || 'Refresh failed');
      }
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAssignNumber() {
    setAssigning(true);
    try {
      const res = await fetch('/api/telnyx/10dlc/assign-number', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Number ${data.assignedPhoneNumber} assigned to your campaign`);
        loadStatus();
      } else {
        toast.error(data.error || 'Failed to assign number');
      }
    } catch {
      toast.error('Failed to assign number');
    } finally {
      setAssigning(false);
    }
  }

  async function handleSubmit() {
    if (!legalBusinessName.trim() || !displayName.trim() || !contactPhone.trim() || !contactEmail.trim() || !vertical.trim() || !street.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (entityType !== 'SOLE_PROPRIETOR' && !taxId.trim()) {
      toast.error('EIN is required unless you are a sole proprietor');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/telnyx/10dlc/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType, legalBusinessName, displayName, taxId, contactPhone, contactEmail,
          website, vertical, whatTheyOffer, street, city, state, postalCode,
          optInUrl,
          campaignOverrides: overrides,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Registration submitted');
        loadStatus();
      } else {
        toast.error(data.error || 'Registration failed');
      }
    } catch {
      toast.error('Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  const defaults = generateCampaignDefaults({
    legalBusinessName: legalBusinessName || 'Your Business',
    vertical: vertical || 'your industry',
    whatTheyOffer: whatTheyOffer,
  });
  const preview: CampaignDefaults = { ...defaults, ...overrides };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const canResubmit = !registration || registration.brand_status === 'failed' || registration.campaign_status === 'failed';
  const canAssignNumber = registration?.campaign_status === 'active' && !registration.assigned_phone_number;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
        <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <p className="text-sm text-sky-800 dark:text-sky-200">
          Carriers require every business sending SMS campaigns to register its own messaging identity (called a
          "10DLC brand and campaign") — this is separate per business, not something HyveWyre can share across
          accounts. This registers <strong>your</strong> business, not HyveWyre.
        </p>
      </div>

      {/* Carriers require a public opt-in page naming this specific business —
          this is submitted as consent evidence with the campaign. */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Your SMS opt-in page
          </h3>
        </div>
        {needsBusinessName ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Add your business name in Settings → Account first — your opt-in page is named after it.
          </p>
        ) : optInUrl ? (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share this link to collect SMS consent. It's submitted with your registration as proof
              that your contacts opted in, so carriers can verify it.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 break-all">
                {optInUrl}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(optInUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={optInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
              >
                View
              </a>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">Loading…</p>
        )}
      </div>

      {registration && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Brand registration</span>
            {statusPill(registration.brand_status)}
          </div>
          {registration.brand_failure_reason && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {registration.brand_failure_reason}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Campaign registration</span>
            {statusPill(registration.campaign_status)}
          </div>
          {registration.campaign_failure_reason && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {registration.campaign_failure_reason}
            </p>
          )}
          {registration.assigned_phone_number && (
            <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {registration.assigned_phone_number} is linked to this campaign
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            {(registration.brand_status === 'pending' || registration.campaign_status === 'pending') && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Check status
              </button>
            )}
            {canAssignNumber && (
              <button
                onClick={handleAssignNumber}
                disabled={assigning}
                className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" /> {assigning ? 'Assigning…' : 'Assign my number to this campaign'}
              </button>
            )}
          </div>
        </div>
      )}

      {canResubmit && (
        <div className="card p-4 md:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {registration ? 'Resubmit registration' : 'Register your business'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Business type</label>
              <select
                value={entityType}
                onChange={e => setEntityType(e.target.value as EntityType)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
              >
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Legal business name</label>
              <input value={legalBusinessName} onChange={e => setLegalBusinessName(e.target.value)} placeholder="Acme Insurance LLC" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Display name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Acme Insurance" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            {entityType !== 'SOLE_PROPRIETOR' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">EIN</label>
                <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="XX-XXXXXXX" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vertical / industry</label>
              <select
                value={vertical}
                onChange={e => setVertical(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">Select industry…</option>
                {VERTICAL_OPTIONS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contact phone</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+15551234567" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contact email</label>
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@business.com" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Website (optional)</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">What do you offer? <span className="font-normal">(used to describe your campaign accurately)</span></label>
              <input value={whatTheyOffer} onChange={e => setWhatTheyOffer(e.target.value)} placeholder="home and auto insurance quotes" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Street address</label>
              <input value={street} onChange={e => setStreet(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">State</label>
                <input value={state} onChange={e => setState(e.target.value)} placeholder="TX" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ZIP</label>
                <input value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowPreview(p => !p)}
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
            >
              {showPreview ? 'Hide' : 'Preview & edit'} campaign message content
            </button>
            {showPreview && (
              <div className="mt-3 space-y-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This is exactly what gets submitted to carriers to describe your campaign — it should describe
                  <strong> your business</strong>, not HyveWyre. Edit if these defaults don't fit.
                </p>
                {(['description', 'sample1', 'sample2', 'messageFlow'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 capitalize">{field}</label>
                    <textarea
                      value={preview[field]}
                      onChange={e => setOverrides(prev => ({ ...prev, [field]: e.target.value }))}
                      rows={2}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:text-slate-100 resize-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            {submitting ? 'Submitting…' : registration ? 'Resubmit registration' : 'Submit registration'}
          </button>
        </div>
      )}
    </div>
  );
}

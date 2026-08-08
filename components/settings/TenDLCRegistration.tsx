'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Link2, Link as LinkIcon } from 'lucide-react';
import { generateCampaignDefaults, CampaignDefaults } from '@/lib/telnyx10dlcDefaults';
import { validateBusinessEmail } from '@/lib/validateBusinessEmail';
import { SELF_SERVE_VERTICALS, TELNYX_VERTICALS, type TelnyxVertical } from '@/lib/telnyx10dlcEnums';

type EntityType = 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT' | 'GOVERNMENT' | 'SOLE_PROPRIETOR';

type Registration = {
  id: string;
  entity_type: EntityType;
  legal_business_name: string;
  display_name: string;
  vertical: string;
  brand_id: string | null;
  brand_status: 'not_started' | 'pending' | 'unverified' | 'verified' | 'failed';
  otp_requested_at: string | null;
  brand_failure_reason: string | null;
  campaign_id: string | null;
  campaign_status: 'not_started' | 'pending' | 'active' | 'failed';
  campaign_failure_reason: string | null;
  assigned_phone_number: string | null;
};

// Vertical options come from lib/telnyx10dlcEnums, which is generated from
// Telnyx's own live enum endpoint and is what the register route validates
// against. Keeping a second copy here is how the two drift.
const VERTICAL_OPTIONS: { value: TelnyxVertical; label: string }[] =
  SELF_SERVE_VERTICALS.map((v: TelnyxVertical) => ({ value: v, label: TELNYX_VERTICALS[v] }));

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'PRIVATE_PROFIT', label: 'Private for-profit company' },
  { value: 'PUBLIC_PROFIT', label: 'Public for-profit company' },
  { value: 'NON_PROFIT', label: 'Non-profit' },
  { value: 'GOVERNMENT', label: 'Government entity' },
  // Restored (#194). It was removed under #119 because the OTP step Telnyx
  // requires had no endpoint, so choosing it submitted a registration that
  // silently never completed. Telnyx have since confirmed the step is manual
  // rather than missing — the user emails them for a PIN — so the path works as
  // long as we say that out loud instead of leaving them waiting.
  { value: 'SOLE_PROPRIETOR', label: 'Sole proprietor / individual (no company)' },
];

function statusPill(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    pending: { label: 'Pending review', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
    // Distinct from `pending` on purpose (#190). Nothing is in flight and no
    // amount of waiting alone resolves it, so it must not read as "in review".
    unverified: { label: 'Not verified — action needed', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
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
  const [einIssuedOn, setEinIssuedOn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [legalNameAttested, setLegalNameAttested] = useState(false);
  const [einDoc, setEinDoc] = useState<{ name: string; url: string | null } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
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
    loadEinDoc();
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
          setEinIssuedOn(data.registration.ein_issued_on || '');
          setEntityType((data.registration.entity_type as EntityType) || 'PRIVATE_PROFIT');
          setFirstName(data.registration.first_name || '');
          setLastName(data.registration.last_name || '');
          setMobilePhone(data.registration.mobile_phone || '');
          // Deliberately NOT restored from `legal_name_attested_at`. The
          // attestation is about the name in the box right now, and the name is
          // editable — carrying a tick over from a previous save would let an
          // edited name inherit a confirmation nobody gave it.
          setLegalNameAttested(false);
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

  // Re-posts the same payload with the fresh-EIN guard waived. Kept separate
  // rather than threading a flag through handleSubmit, so the ordinary path
  // cannot accidentally carry the override.
  async function submitOverridingFreshEin() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/telnyx/10dlc/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType, legalBusinessName, displayName, taxId, contactPhone, contactEmail,
          website, vertical, whatTheyOffer, street, city, state, postalCode,
          optInUrl,
          einIssuedOn: einIssuedOn || undefined,
          legalNameAttested,
          firstName, lastName, mobilePhone,
          // Only ever true from this form, and only when a brand already
          // exists — the API refuses to replace one otherwise, so an
          // accidental resubmit cannot be charged twice.
          replaceBrand: !!registration?.brand_id,
          acknowledgeFreshEin: true,
          campaignOverrides: overrides,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.actionRequired === 'sole_prop_otp') {
          toast.success('Business registered', { duration: 6000 });
          window.alert(data.message);
        } else {
          toast.success('Registration submitted');
        }
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

  // Self-reported, because the request is an email we cannot observe. See the
  // route for why automating it would be the wrong trade.
  async function handleOtpRequested() {
    try {
      const res = await fetch('/api/telnyx/10dlc/otp-requested', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || 'Could not record that');
        return;
      }
      toast.success('Noted — reply to their email with the PIN within 24 hours');
      loadStatus();
    } catch {
      toast.error('Could not record that');
    }
  }

  async function uploadEinDoc(file: File) {
    setUploadingDoc(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/telnyx/10dlc/ein-document', { method: 'POST', body });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }
      toast.success('EIN letter saved');
      await loadEinDoc();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function loadEinDoc() {
    try {
      const res = await fetch('/api/telnyx/10dlc/ein-document');
      const data = await res.json();
      setEinDoc(data.ok && data.document ? { name: data.document.name, url: data.document.url } : null);
    } catch {
      /* the document is supplementary — a failed read must not block the form */
    }
  }

  async function removeEinDoc() {
    try {
      const res = await fetch('/api/telnyx/10dlc/ein-document', { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || 'Could not remove the file');
        return;
      }
      setEinDoc(null);
    } catch {
      toast.error('Could not remove the file');
    }
  }

  async function handleSubmit() {
    if (!legalBusinessName.trim() || !displayName.trim() || !contactPhone.trim() || !contactEmail.trim() || !vertical.trim() || !street.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    // Unconditional. SOLE_PROPRIETOR was withdrawn (#119), so "unless you are a
    // sole proprietor" described an option that no longer exists and told the
    // user an exemption was available when none is.
    if (!taxId.trim()) {
      toast.error('An EIN is required. Sole proprietors can get one free from the IRS in about ten minutes.');
      return;
    }

    // Caught here as well as in the API, because discovering a required upload
    // after filling a fifteen-field form is a bad way to learn it. The API is
    // still the boundary — this is only the earlier, kinder copy of the rule.
    if (entityType === 'SOLE_PROPRIETOR' && !einDoc) {
      toast.error('Upload your IRS EIN letter (CP 575) — sole proprietor registrations are reviewed by a person, and they always ask for it.');
      return;
    }
    // Same check the onboarding form and the API route make (#1) — carriers
    // reject an unreachable contact address, and this is a real submission that
    // creates a billable brand, so catching it here saves a charge.
    const emailCheck = validateBusinessEmail(contactEmail);
    if (!emailCheck.ok) {
      toast.error(emailCheck.reason);
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
          einIssuedOn: einIssuedOn || undefined,
          legalNameAttested,
          firstName, lastName, mobilePhone,
          // Only ever true from this form, and only when a brand already
          // exists — the API refuses to replace one otherwise, so an
          // accidental resubmit cannot be charged twice.
          replaceBrand: !!registration?.brand_id,
          campaignOverrides: overrides,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // The sole-proprietor path ends with a manual step, and a 4-second toast
        // is not where you put a 24-hour deadline (#194).
        if (data.actionRequired === 'sole_prop_otp') {
          toast.success('Business registered', { duration: 6000 });
          window.alert(data.message);
        } else {
          toast.success('Registration submitted');
        }
        loadStatus();
      } else if (data.canOverride) {
        // The fresh-EIN block is a judgement call, not a carrier rule, so it is
        // the user's to overrule — but only after being told what it costs.
        toast.error(data.error, { duration: 12000 });
        if (window.confirm(`${data.error}\n\nRegister anyway? The fee is charged even if it fails.`)) {
          await submitOverridingFreshEin();
        }
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

  const isSoleProp = registration?.entity_type === 'SOLE_PROPRIETOR';
  const canResubmit =
    !registration ||
    registration.brand_status === 'failed' ||
    registration.campaign_status === 'failed' ||
    // An unverified NON-sole-prop brand cannot be repaired: companyName and ein
    // are immutable at TCR once registered, so a corrected filing means a new
    // brand. Sole props are excluded — theirs clears via the OTP, and offering
    // "register again" there would sell a second $4.50 brand to someone who
    // just needs to answer an email.
    (registration.brand_status === 'unverified' && registration.entity_type !== 'SOLE_PROPRIETOR');
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

          {/* An unverified brand needs a next step, not a status.
            *
            * This used to render as "Pending review", which told the user to wait
            * for something that was never coming (#190). The two remedies have
            * nothing in common, so they are written separately rather than
            * softened into one message that fits neither. */}
          {registration.brand_status === 'unverified' && (
            isSoleProp ? (
              <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 px-3 py-3 space-y-2">
                <p className="text-xs text-orange-900 dark:text-orange-200">
                  <strong>One step left, and only you can do it.</strong> Email{' '}
                  <a href="mailto:10dlcquestions@telnyx.com?subject=10DLC%20OTP%20PIN%20request" className="underline">
                    10dlcquestions@telnyx.com
                  </a>{' '}
                  asking for your 10DLC OTP PIN, quoting your business name. They text the PIN to{' '}
                  {mobilePhone || 'your mobile'}, and you reply to their email with it{' '}
                  <strong>within 24 hours</strong>.
                </p>
                {registration.otp_requested_at ? (
                  <p className="text-xs text-orange-800 dark:text-orange-300">
                    Requested {new Date(registration.otp_requested_at).toLocaleString()}. If no PIN has
                    arrived, reply to your own email to chase it — the request is theirs to action.
                  </p>
                ) : (
                  <button
                    onClick={handleOtpRequested}
                    className="text-xs px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    I&apos;ve emailed them — start the 24-hour clock
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 px-3 py-3">
                <p className="text-xs text-orange-900 dark:text-orange-200">
                  <strong>Carriers could not match your business.</strong> Usually the legal name does
                  not match your IRS EIN letter exactly, or the EIN is too new to have reached them —
                  that takes a few weeks. Waiting is free and often enough.
                </p>
                <p className="mt-1.5 text-xs text-orange-900 dark:text-orange-200">
                  If the name is wrong it cannot be edited: carriers freeze it once registered, so a
                  correction means registering again from scratch. Check it against your EIN letter
                  before you do — the fee is charged each time.
                </p>
              </div>
            )
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
            {(registration.brand_status === 'pending' || registration.brand_status === 'unverified' || registration.campaign_status === 'pending') && (
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
            {/* Unconditional now. SOLE_PROPRIETOR was withdrawn (#119) — it is gone
              * from the picker and the API refuses it — so gating this field on it
              * only hid the EIN box behind a value nobody can select. */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">EIN</label>
              <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="XX-XXXXXXX" className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100" />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No company needed — the IRS issues an EIN to sole proprietors too, free, in about ten
                minutes at{' '}
                <a
                  href="https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  irs.gov
                </a>
                . Enter the legal name exactly as the EIN is registered — carriers check it against
                IRS records.
              </p>
            </div>

            {/* Sole proprietors register as a PERSON.
              *
              * These are the only entity type that stores a name — PRIVATE_PROFIT
              * accepts firstName/lastName and silently discards them (#193) — so they
              * are shown only where they do something. */}
            {entityType === 'SOLE_PROPRIETOR' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">First name</label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="As on your EIN letter"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Last name</label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="As on your EIN letter"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Mobile number for verification
                  </label>
                  <input
                    value={mobilePhone}
                    onChange={e => setMobilePhone(e.target.value)}
                    placeholder="(407) 555-0142"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Carriers text a verification PIN here. It has to be a mobile — a landline stops the
                    registration without an error.
                  </p>
                </div>
                <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
                  <p className="text-xs text-amber-900 dark:text-amber-200">
                    <strong>One manual step.</strong> After you submit, email{' '}
                    <a href="mailto:10dlcquestions@telnyx.com" className="underline">10dlcquestions@telnyx.com</a>{' '}
                    to request your 10DLC OTP PIN. They text it to the number above, and you reply to
                    their email with it within 24 hours. Your registration waits until that is done.
                  </p>
                </div>
              </>
            )}

            {/* The date on the CP 575.
              *
              * Carriers verify against IRS records that take weeks to propagate, so a
              * brand filed on a fresh EIN cannot match and the fee is charged anyway.
              * This is the field the API uses to stop that (#193). */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Date your EIN was issued
              </label>
              <input
                type="date"
                value={einIssuedOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setEinIssuedOn(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Printed at the top of your IRS letter. A brand-new EIN has not reached the carriers
                yet — registering too early fails and still costs the fee.
              </p>
            </div>

            {/* Supporting document.
              *
              * Not sent to Telnyx — their brand API has no document field. Kept so that
              * when a registration needs a human to resolve it, the proof of the
              * EIN-to-name pairing is already here. */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                IRS EIN letter (CP 575){' '}
                {entityType === 'SOLE_PROPRIETOR'
                  ? <span className="font-normal text-red-600 dark:text-red-400">— required</span>
                  : <span className="font-normal text-slate-400">— optional</span>}
              </label>
              {einDoc ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2">
                  <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">
                    {einDoc.name}
                  </span>
                  {einDoc.url && (
                    <a href={einDoc.url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-slate-600 dark:text-slate-300">
                      View
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={removeEinDoc}
                    className="text-xs underline text-red-600 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/heic"
                  disabled={uploadingDoc}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadEinDoc(f);
                    e.target.value = '';
                  }}
                  className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:text-slate-700 dark:file:text-slate-200"
                />
              )}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {uploadingDoc
                  ? 'Uploading…'
                  : entityType === 'SOLE_PROPRIETOR'
                    ? 'Stored privately. Sole proprietor registrations are verified by a person at the carrier, and that always starts by asking for this — having it on file now is the difference between a day and a fortnight.'
                    : 'Stored privately. Carriers cannot be sent documents automatically, but if your registration needs review this is the proof that resolves it fastest.'}
              </p>
            </div>

            {/* The attestation.
              *
              * The advice to match the EIN letter was already on this form and was
              * still not followed — a shortened legal name was filed and rejected. An
              * explicit confirmation makes someone look at the letter before the fee
              * is charged. */}
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={legalNameAttested}
                  onChange={e => setLegalNameAttested(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm <strong className="text-slate-800 dark:text-slate-100">{legalBusinessName || 'the legal business name above'}</strong>{' '}
                  matches my IRS EIN letter exactly — including middle initials, punctuation and
                  suffixes. Carriers compare it character-for-character and reject a near-match
                  after charging the fee.
                </span>
              </label>
            </div>

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

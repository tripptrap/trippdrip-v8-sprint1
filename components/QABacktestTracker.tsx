'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, AlertCircle, MinusCircle,
  ChevronDown, ChevronRight, Upload, X, Download, RotateCcw,
  MessageSquare, Camera, BarChart3, Copy, Sparkles, Loader2
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type QAStatus = 'untested' | 'pass' | 'fail' | 'in_progress' | 'blocked';

export interface QAItemState {
  status: QAStatus;
  comment: string;
  screenshots: string[]; // base64 compressed JPEGs
  updatedAt: string;
}

interface QATestItem {
  id: string;
  label: string;
}

interface QAPage {
  page: string;
  route: string;
  items: QATestItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<QAStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  untested:    { label: 'Untested',     color: 'text-slate-500',   bg: 'bg-slate-100 dark:bg-slate-700',         border: 'border-slate-300 dark:border-slate-600',  icon: MinusCircle },
  pass:        { label: 'Pass',         color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40',   border: 'border-emerald-400 dark:border-emerald-600', icon: CheckCircle },
  fail:        { label: 'Fail',         color: 'text-red-600',     bg: 'bg-red-100 dark:bg-red-900/40',           border: 'border-red-400 dark:border-red-600',       icon: XCircle },
  in_progress: { label: 'In Progress',  color: 'text-sky-600',     bg: 'bg-sky-100 dark:bg-sky-900/40',           border: 'border-sky-400 dark:border-sky-600',       icon: Clock },
  blocked:     { label: 'Blocked',      color: 'text-amber-600',   bg: 'bg-amber-100 dark:bg-amber-900/40',       border: 'border-amber-400 dark:border-amber-600',   icon: AlertCircle },
};

const STORAGE_KEY = 'hyvewyre_qa_backtest_v1';

// ─────────────────────────────────────────────────────────────────────────────
// ALL PAGES + TEST ITEMS
// ─────────────────────────────────────────────────────────────────────────────
const QA_PAGES: QAPage[] = [
  {
    page: 'Landing Page',
    route: '/preview',
    items: [
      { id: 'preview_hero',      label: 'Hero section renders with correct headline and CTA buttons' },
      { id: 'preview_pricing',   label: 'Pricing table shows Growth ($30/mo) and Scale ($98/mo) correctly' },
      { id: 'preview_discount',  label: 'Scale tier point pack discount is prominently displayed' },
      { id: 'preview_features',  label: 'Features section is accurate and complete' },
      { id: 'preview_cta',       label: '"Get Started" / signup CTA buttons navigate to registration' },
      { id: 'preview_team',      label: 'Team profile links work (Tripp Browning, Carson Rios)' },
      { id: 'preview_mobile',    label: 'Page is mobile responsive (test at 375px, 768px, 1280px)' },
      { id: 'preview_legal',     label: 'Footer legal links work (Privacy, Terms, Compliance, Refund)' },
    ],
  },
  {
    page: 'Opt-In / Compliance',
    route: '/opt-in',
    items: [
      { id: 'optin_loads',   label: 'Page loads without errors' },
      { id: 'optin_text',    label: 'Compliance text is accurate and up to date' },
      { id: 'optin_contact', label: 'Contact / business information is correct' },
    ],
  },
  {
    page: 'Privacy Policy',
    route: '/privacy',
    items: [
      { id: 'privacy_loads',   label: 'Page loads without errors' },
      { id: 'privacy_content', label: 'Content is complete and up to date' },
    ],
  },
  {
    page: 'Terms of Service',
    route: '/terms',
    items: [
      { id: 'terms_loads',   label: 'Page loads without errors' },
      { id: 'terms_content', label: 'Content is complete and up to date' },
    ],
  },
  {
    page: 'Register',
    route: '/auth/register',
    items: [
      { id: 'register_form',       label: 'Registration form renders all fields' },
      { id: 'register_email_val',  label: 'Email validation shows error on invalid format' },
      { id: 'register_pass_val',   label: 'Password validation enforces requirements' },
      { id: 'register_submit',     label: 'Form submits and creates account successfully' },
      { id: 'register_redirect',   label: 'Redirects to onboarding after successful signup' },
      { id: 'register_duplicate',  label: 'Duplicate email shows appropriate error message' },
    ],
  },
  {
    page: 'Login',
    route: '/auth/login',
    items: [
      { id: 'login_form',    label: 'Login form renders correctly' },
      { id: 'login_success', label: 'Correct credentials log in and redirect to dashboard' },
      { id: 'login_fail',    label: 'Incorrect credentials show a clear error message' },
      { id: 'login_forgot',  label: '"Forgot password" link navigates correctly' },
    ],
  },
  {
    page: 'Forgot Password',
    route: '/auth/forgot-password',
    items: [
      { id: 'forgot_form',    label: 'Form renders correctly' },
      { id: 'forgot_sends',   label: 'Valid email triggers a password reset email' },
      { id: 'forgot_invalid', label: 'Invalid / unknown email shows error' },
    ],
  },
  {
    page: 'Dashboard',
    route: '/dashboard',
    items: [
      { id: 'dash_loads',   label: 'Page loads without errors or blank sections' },
      { id: 'dash_stats',   label: 'Stats / counters display real data' },
      { id: 'dash_nav',     label: 'All navigation sidebar links route correctly' },
      { id: 'dash_user',    label: 'Correct user name / email displayed in topbar' },
      { id: 'dash_credits', label: 'Credit balance shown and matches actual balance' },
    ],
  },
  {
    page: 'Leads',
    route: '/leads',
    items: [
      { id: 'leads_loads',           label: 'Lead list loads with data' },
      { id: 'leads_search',          label: 'Search by name/phone filters results correctly' },
      { id: 'leads_filter_tag',      label: 'Filter by tag works' },
      { id: 'leads_filter_campaign', label: 'Filter by campaign works' },
      { id: 'leads_hide_sold',       label: '"Hide Sold" toggle defaults to hidden; toggle reveals sold leads' },
      { id: 'leads_bulk_select',     label: 'Bulk select (checkbox + select all) works' },
      { id: 'leads_import_csv',      label: 'Import CSV — file uploads, leads appear in list' },
      { id: 'leads_add_manual',      label: 'Add lead manually — form validates and submits' },
      { id: 'leads_edit',            label: 'Edit lead — changes save and reflect immediately' },
      { id: 'leads_delete',          label: 'Delete lead — confirmation shown, removes from list' },
      { id: 'leads_assign_campaign', label: 'Assign campaign to a lead works' },
      { id: 'leads_tags',            label: 'Add / edit / remove tags on a lead' },
      { id: 'leads_send_text',       label: 'Send text action from lead row opens compose' },
      { id: 'leads_mark_sold',       label: '"Mark as sold" converts lead to client correctly' },
    ],
  },
  {
    page: 'Clients',
    route: '/clients',
    items: [
      { id: 'clients_loads',       label: 'Client list loads (shows sold leads)' },
      { id: 'clients_text_btn',    label: 'Text button per row routes to /texts with correct phone pre-filled' },
      { id: 'clients_empty_state', label: 'Empty state shows when no clients; "Go to Leads" CTA works' },
      { id: 'clients_data',        label: 'Client details (name, phone, status) are correct' },
    ],
  },
  {
    page: 'Texts / Messages',
    route: '/texts',
    items: [
      { id: 'texts_loads',        label: 'Thread list loads' },
      { id: 'texts_lead_tab',     label: 'Lead conversations tab shows lead threads only' },
      { id: 'texts_client_tab',   label: 'Client conversations tab shows client threads only' },
      { id: 'texts_open_thread',  label: 'Clicking a thread opens the conversation' },
      { id: 'texts_send',         label: 'Compose and send a message — appears in thread immediately' },
      { id: 'texts_schedule',     label: 'Schedule a message — appears in scheduled list' },
      { id: 'texts_ai_toggle',    label: 'AI toggle per thread enables / disables auto-respond' },
      { id: 'texts_inbound',      label: 'Inbound messages appear in the correct thread' },
      { id: 'texts_unread',       label: 'Unread badge counts update on new message' },
    ],
  },
  {
    page: 'Campaigns',
    route: '/campaigns',
    items: [
      { id: 'campaigns_loads',      label: 'Campaign list loads' },
      { id: 'campaigns_create',     label: 'Create new campaign — saves and appears in list' },
      { id: 'campaigns_add_leads',  label: 'Add leads to a campaign' },
      { id: 'campaigns_run',        label: 'Run campaign — bulk messages send, credits deducted' },
      { id: 'campaigns_stats',      label: 'Campaign stats (messages sent, credits used) display accurately' },
      { id: 'campaigns_delete',     label: 'Delete campaign — confirmation shown, removes from list' },
    ],
  },
  {
    page: 'Flows',
    route: '/flows',
    items: [
      { id: 'flows_loads',  label: 'Flow list loads' },
      { id: 'flows_create', label: 'Create new flow — builder opens and saves successfully' },
      { id: 'flows_edit',   label: 'Edit existing flow — changes persist' },
      { id: 'flows_delete', label: 'Delete flow — removes from list' },
      { id: 'flows_steps',  label: 'Flow steps can be added, reordered, and removed' },
      { id: 'flows_assign', label: 'Assign flow to leads / campaigns works' },
    ],
  },
  {
    page: 'Follow-Ups',
    route: '/follow-ups',
    items: [
      { id: 'followups_loads',         label: 'Follow-up list loads' },
      { id: 'followups_search',        label: 'Create follow-up — lead search returns live results' },
      { id: 'followups_create_submit', label: 'Create follow-up — form submits and item appears in list' },
      { id: 'followups_complete',      label: 'Mark follow-up complete — status updates in list' },
      { id: 'followups_filter_status', label: 'Filter by status (pending / completed) works' },
      { id: 'followups_filter_prio',   label: 'Filter by priority works' },
      { id: 'followups_edit',          label: 'Edit follow-up — changes save' },
      { id: 'followups_delete',        label: 'Delete follow-up — removes from list' },
    ],
  },
  {
    page: 'Phone Numbers',
    route: '/phone-numbers',
    items: [
      { id: 'phones_loads',    label: 'Number list loads with active numbers' },
      { id: 'phones_search',   label: 'Search available numbers by area code' },
      { id: 'phones_purchase', label: 'Purchase number flow completes and number appears' },
      { id: 'phones_primary',  label: 'Set number as primary — updates correctly' },
      { id: 'phones_status',   label: 'Number status (active / inactive) displays correctly' },
    ],
  },
  {
    page: 'Points / Credits',
    route: '/points',
    items: [
      { id: 'points_balance',  label: 'Credit balance displays correctly and matches database' },
      { id: 'points_history',  label: 'Transaction history loads with accurate records' },
      { id: 'points_modal',    label: 'Buy point pack modal opens and shows correct packs / prices' },
      { id: 'points_stripe',   label: 'Stripe checkout redirects correctly for a point pack' },
      { id: 'points_success',  label: 'After successful purchase, credits are added to balance' },
    ],
  },
  {
    page: 'Receptionist',
    route: '/receptionist',
    items: [
      { id: 'recept_loads',           label: 'Settings page loads with existing configuration' },
      { id: 'recept_identity_saves',  label: 'Identity section saves (agent name, business, offer, target audience, etc.)' },
      { id: 'recept_identity_preview',label: 'Live preview updates as identity fields are filled' },
      { id: 'recept_identity_warning',label: 'Amber warning banner shows when identity is empty' },
      { id: 'recept_hours_toggle',    label: 'Business hours toggle enables / disables schedule' },
      { id: 'recept_hours_save',      label: 'Business hours times (open/close per day) save correctly' },
      { id: 'recept_ai_toggle',       label: 'AI enabled / disabled toggle works' },
      { id: 'recept_dirty_state',     label: 'Save button only activates when unsaved changes exist' },
      { id: 'recept_persist',         label: 'All settings persist correctly after page refresh' },
    ],
  },
  {
    page: 'Integrations',
    route: '/integrations',
    items: [
      { id: 'integrations_loads',   label: 'Page loads with Google Calendar card (no coming soon cards)' },
      { id: 'integrations_cal',     label: 'Google Calendar "Setup" button navigates correctly' },
      { id: 'integrations_request', label: '"Request Integration" email link opens email client' },
    ],
  },
  {
    page: 'Analytics',
    route: '/analytics',
    items: [
      { id: 'analytics_loads',    label: 'Page loads without errors' },
      { id: 'analytics_overview', label: 'Overview stats (messages, leads, response rate) display' },
      { id: 'analytics_charts',   label: 'Charts render with real data' },
      { id: 'analytics_date',     label: 'Date range filter updates all charts' },
      { id: 'analytics_campaign', label: 'Campaign performance breakdown loads' },
      { id: 'analytics_export',   label: 'Export functionality downloads a valid file' },
    ],
  },
  {
    page: 'Settings',
    route: '/settings',
    items: [
      { id: 'settings_loads',   label: 'Page loads with existing profile data populated' },
      { id: 'settings_profile', label: 'Profile info (name, email, business name) saves correctly' },
      { id: 'settings_notifs',  label: 'Notification preferences save' },
      { id: 'settings_dnc',     label: 'DNC list displays and supports add / remove' },
      { id: 'settings_spam',    label: 'Spam protection settings save' },
    ],
  },
  {
    page: 'Roadmap',
    route: '/roadmap',
    items: [
      { id: 'roadmap_loads',    label: 'Page loads with roadmap items' },
      { id: 'roadmap_referral', label: 'Referral program coming soon section displays' },
      { id: 'roadmap_feedback', label: '"Send Feedback" email link works' },
    ],
  },
  {
    page: 'Admin Panel',
    route: '/admin',
    items: [
      { id: 'admin_loads',        label: 'Page loads for admin email — redirects non-admin to /dashboard' },
      { id: 'admin_stats',        label: 'Platform stats (total users, messages, leads) load' },
      { id: 'admin_user_list',    label: 'User list loads with all accounts' },
      { id: 'admin_search',       label: 'Search users by email / name works' },
      { id: 'admin_filter_plan',  label: 'Filter by plan (growth / scale) works' },
      { id: 'admin_filter_status',label: 'Filter by account status works' },
      { id: 'admin_expand',       label: 'Expanding a user row shows their message history' },
      { id: 'admin_suspend',      label: 'Suspend user action works with duration and reason' },
      { id: 'admin_ban',          label: 'Ban user action blocks account access' },
      { id: 'admin_grant',        label: 'Grant credits modal works and credits appear in user account' },
      { id: 'admin_dev_notes',    label: 'Internal Dev Notes panel expands with all 4 sub-sections' },
      { id: 'admin_qa_persist',   label: 'QA Backtest Tracker — status / comments persist on refresh' },
    ],
  },
  {
    page: 'Team — Tripp Browning',
    route: '/team/tripp-browning',
    items: [
      { id: 'team_tb_public',  label: 'Page loads without authentication (public access confirmed)' },
      { id: 'team_tb_profile', label: 'Profile information (role, responsibilities, authorization) displays' },
      { id: 'team_tb_email',   label: 'Email links open email client with correct address' },
      { id: 'team_tb_cta',     label: '"Learn More" → /preview and "Contact Us" work' },
    ],
  },
  {
    page: 'Team — Carson Rios',
    route: '/team/carson-rios',
    items: [
      { id: 'team_cr_public',  label: 'Page loads without authentication (public access confirmed)' },
      { id: 'team_cr_profile', label: 'Profile information (role, responsibilities, authorization) displays' },
      { id: 'team_cr_email',   label: 'Email link opens email client with correct address' },
      { id: 'team_cr_cta',     label: '"Back to HyveWyre" → /preview works' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE COMPRESSION
// ─────────────────────────────────────────────────────────────────────────────
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const MAX_W = 1200;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function QABacktestTracker() {
  const [open, setOpen] = useState(false);
  const [qaData, setQaData] = useState<Record<string, QAItemState>>({});
  const [openPages, setOpenPages] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setQaData(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Save to localStorage
  const save = useCallback((next: Record<string, QAItemState>) => {
    try {
      const json = JSON.stringify(next);
      // Warn if > 3MB
      if (json.length > 3 * 1024 * 1024) setStorageWarning(true);
      else setStorageWarning(false);
      localStorage.setItem(STORAGE_KEY, json);
    } catch { setStorageWarning(true); }
    setQaData(next);
  }, []);

  function getItem(id: string): QAItemState {
    return qaData[id] ?? { status: 'untested', comment: '', screenshots: [], updatedAt: '' };
  }

  function updateStatus(id: string, status: QAStatus) {
    const cur = getItem(id);
    save({ ...qaData, [id]: { ...cur, status, updatedAt: new Date().toISOString() } });
  }

  function updateComment(id: string, comment: string) {
    const cur = getItem(id);
    save({ ...qaData, [id]: { ...cur, comment, updatedAt: new Date().toISOString() } });
  }

  async function addScreenshot(id: string, file: File) {
    const b64 = await compressImage(file);
    const cur = getItem(id);
    if (cur.screenshots.length >= 5) return; // cap at 5 per item
    save({ ...qaData, [id]: { ...cur, screenshots: [...cur.screenshots, b64], updatedAt: new Date().toISOString() } });
  }

  function removeScreenshot(id: string, idx: number) {
    const cur = getItem(id);
    const shots = cur.screenshots.filter((_, i) => i !== idx);
    save({ ...qaData, [id]: { ...cur, screenshots: shots, updatedAt: new Date().toISOString() } });
  }

  function togglePage(route: string) {
    setOpenPages(prev => {
      const next = new Set(prev);
      next.has(route) ? next.delete(route) : next.add(route);
      return next;
    });
  }

  function toggleItem(id: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exportData() {
    const exportObj = {
      exportedAt: new Date().toISOString(),
      summary: buildSummary(),
      pages: QA_PAGES.map(p => ({
        page: p.page,
        route: p.route,
        items: p.items.map(item => ({
          id: item.id,
          label: item.label,
          ...getItem(item.id),
          screenshots: getItem(item.id).screenshots.length + ' screenshot(s)',
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-backtest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setQaData({});
    setConfirmReset(false);
  }

  function buildSummary() {
    let total = 0, pass = 0, fail = 0, inProgress = 0, blocked = 0, untested = 0;
    QA_PAGES.forEach(p => p.items.forEach(item => {
      total++;
      const s = getItem(item.id).status;
      if (s === 'pass') pass++;
      else if (s === 'fail') fail++;
      else if (s === 'in_progress') inProgress++;
      else if (s === 'blocked') blocked++;
      else untested++;
    }));
    return { total, pass, fail, inProgress, blocked, untested };
  }

  const summary = buildSummary();
  const pct = summary.total > 0 ? Math.round((summary.pass / summary.total) * 100) : 0;

  return (
    <div className="mt-8 border-t-2 border-dashed border-violet-200 dark:border-violet-900/50 pt-8">

      {/* ── Master toggle ── */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full text-left group mb-4"
      >
        <BarChart3 className="h-5 w-5 text-violet-400 group-hover:text-violet-500 transition-colors" />
        <span className="text-sm font-semibold text-violet-500 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300 uppercase tracking-widest">
          QA Backtest Tracker
        </span>
        <span className="text-xs text-slate-400 ml-2">
          {summary.pass}/{summary.total} pass · {summary.fail} fail · {summary.untested} untested
        </span>
        <span className="ml-auto">
          {open ? <ChevronDown className="h-4 w-4 text-violet-400" /> : <ChevronRight className="h-4 w-4 text-violet-400" />}
        </span>
      </button>

      {open && (
        <div className="space-y-4">

          {/* ── Storage warning ── */}
          {storageWarning && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Local storage is getting full. Consider removing old screenshots or exporting and resetting.
            </div>
          )}

          {/* ── Summary bar ── */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Overall Progress — {pct}% complete
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportData}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Export JSON
                </button>
                {confirmReset ? (
                  <div className="flex gap-1">
                    <button onClick={resetAll} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">Confirm Reset</button>
                    <button onClick={() => setConfirmReset(false)} className="px-3 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 rounded-lg transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset All
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              {(Object.entries(STATUS_CONFIG) as [QAStatus, typeof STATUS_CONFIG[QAStatus]][]).map(([key, cfg]) => {
                const count = key === 'pass' ? summary.pass
                  : key === 'fail' ? summary.fail
                  : key === 'in_progress' ? summary.inProgress
                  : key === 'blocked' ? summary.blocked
                  : summary.untested;
                const Icon = cfg.icon;
                return (
                  <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}: {count}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 italic">
              Data saved in browser localStorage. To share screenshots with Claude: paste images directly into the chat.
            </p>
          </div>

          {/* ── Per-page sections ── */}
          {QA_PAGES.map((page) => {
            const pageItems = page.items.map(i => getItem(i.id));
            const pagePass    = pageItems.filter(i => i.status === 'pass').length;
            const pageFail    = pageItems.filter(i => i.status === 'fail').length;
            const pageBlocked = pageItems.filter(i => i.status === 'blocked').length;
            const pageIP      = pageItems.filter(i => i.status === 'in_progress').length;
            const allPassed   = pagePass === page.items.length;
            const hasFail     = pageFail > 0;
            const isOpen      = openPages.has(page.route);

            return (
              <div key={page.route} className={`rounded-xl border overflow-hidden ${hasFail ? 'border-red-200 dark:border-red-900/50' : allPassed ? 'border-emerald-200 dark:border-emerald-900/50' : 'border-slate-200 dark:border-slate-700'}`}>

                {/* Page header */}
                <button
                  onClick={() => togglePage(page.route)}
                  className={`flex items-center gap-3 w-full text-left px-4 py-3 transition-colors ${hasFail ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : allPassed ? 'bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20' : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{page.page}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{page.route}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {pagePass > 0    && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 font-medium">{pagePass}✓</span>}
                    {pageFail > 0    && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 font-medium">{pageFail}✗</span>}
                    {pageIP > 0      && <span className="text-xs px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-600 font-medium">{pageIP}⟳</span>}
                    {pageBlocked > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 font-medium">{pageBlocked}⚠</span>}
                    <span className="text-xs text-slate-400">{pagePass}/{page.items.length}</span>
                  </div>
                </button>

                {/* Test items */}
                {isOpen && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {page.items.map((testItem) => (
                      <TestItemRow
                        key={testItem.id}
                        testItem={testItem}
                        state={getItem(testItem.id)}
                        expanded={expandedItems.has(testItem.id)}
                        page={page.page}
                        route={page.route}
                        onToggleExpand={() => toggleItem(testItem.id)}
                        onStatusChange={(s) => updateStatus(testItem.id, s)}
                        onCommentChange={(c) => updateComment(testItem.id, c)}
                        onAddScreenshot={(f) => addScreenshot(testItem.id, f)}
                        onRemoveScreenshot={(i) => removeScreenshot(testItem.id, i)}
                        onOpenLightbox={setLightbox}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Screenshot"
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST ITEM ROW
// ─────────────────────────────────────────────────────────────────────────────
interface TestItemRowProps {
  testItem: QATestItem;
  state: QAItemState;
  expanded: boolean;
  page: string;
  route: string;
  onToggleExpand: () => void;
  onStatusChange: (s: QAStatus) => void;
  onCommentChange: (c: string) => void;
  onAddScreenshot: (f: File) => void;
  onRemoveScreenshot: (i: number) => void;
  onOpenLightbox: (src: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// COPY IMAGE TO CLIPBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function copyImageToClipboard(base64: string): Promise<boolean> {
  try {
    // Convert base64 → blob
    const res = await fetch(base64);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch {
    // Fallback: copy the data URL as text
    try {
      await navigator.clipboard.writeText(base64);
      return true;
    } catch { return false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREENSHOT CARD — thumbnail + Copy + Ask AI
// ─────────────────────────────────────────────────────────────────────────────
function ScreenshotCard({
  src, index, itemLabel, status, comment, page, route,
  onRemove, onOpenLightbox,
}: {
  src: string;
  index: number;
  itemLabel: string;
  status: QAStatus;
  comment: string;
  page: string;
  route: string;
  onRemove: () => void;
  onOpenLightbox: (s: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);

  async function handleCopy() {
    const ok = await copyImageToClipboard(src);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleAskAI() {
    setAiLoading(true);
    setAiError(null);
    setShowAi(true);
    try {
      const res = await fetch('/api/admin/qa-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: src, itemLabel, status, comment, page, route }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAiResult(data.analysis);
    } catch (err: any) {
      setAiError(err.message ?? 'Something went wrong');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
      {/* Thumbnail row */}
      <div className="relative group flex items-start gap-2 p-2">
        <img
          src={src}
          alt={`Screenshot ${index + 1}`}
          className="h-20 w-28 object-cover rounded border border-slate-100 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0"
          onClick={() => onOpenLightbox(src)}
        />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-xs text-slate-400">Screenshot {index + 1}</span>
          <div className="flex flex-wrap gap-1.5">
            {/* Copy */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                copied
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
              title="Copy image to clipboard — then paste in Claude chat"
            >
              <Copy className="h-3 w-3" />
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Ask AI */}
            <button
              onClick={handleAskAI}
              disabled={aiLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-60"
              title="Send to GPT-4o vision for instant QA analysis"
            >
              {aiLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing…</>
                : <><Sparkles className="h-3 w-3" /> Ask AI</>
              }
            </button>

            {/* Remove */}
            <button
              onClick={onRemove}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md font-medium bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-tight">
            Copy → paste in Claude chat · or Ask AI for instant analysis
          </p>
        </div>
      </div>

      {/* AI analysis panel */}
      {showAi && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> GPT-4o Analysis
            </span>
            <button
              onClick={() => setShowAi(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending screenshot to GPT-4o vision…
            </div>
          )}
          {aiError && (
            <p className="text-xs text-red-500">{aiError}</p>
          )}
          {aiResult && !aiLoading && (
            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              {aiResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST ITEM ROW
// ─────────────────────────────────────────────────────────────────────────────
function TestItemRow({
  testItem, state, expanded, page, route, onToggleExpand,
  onStatusChange, onCommentChange, onAddScreenshot,
  onRemoveScreenshot, onOpenLightbox,
}: TestItemRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = STATUS_CONFIG[state.status];
  const Icon = cfg.icon;
  const hasContent = state.comment.trim() || state.screenshots.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900">
      {/* Row header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={onToggleExpand} className="flex-shrink-0 mt-0.5">
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </button>

        <button onClick={onToggleExpand} className="flex-1 text-left min-w-0">
          <span className={`text-xs leading-relaxed ${state.status === 'pass' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
            {testItem.label}
          </span>
          {hasContent && (
            <span className="ml-2 text-xs text-slate-400">
              {state.comment && <span>💬</span>}
              {state.screenshots.length > 0 && <span> 📷{state.screenshots.length}</span>}
            </span>
          )}
        </button>

        {/* Status buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {(Object.keys(STATUS_CONFIG) as QAStatus[]).map((s) => {
            const c = STATUS_CONFIG[s];
            const SIcon = c.icon;
            return (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                title={c.label}
                className={`p-1 rounded transition-all ${state.status === s ? `${c.bg} ${c.color} ring-1 ${c.border}` : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'}`}
              >
                <SIcon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-50 dark:border-slate-800">

          {/* Comment */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <MessageSquare className="h-3 w-3" /> Notes / Comments
            </label>
            <textarea
              value={state.comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Add notes, what failed, reproduction steps, environment details..."
              rows={3}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
            {state.updatedAt && (
              <p className="text-xs text-slate-400 mt-1">
                Last updated: {new Date(state.updatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Screenshots */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-2">
              <Camera className="h-3 w-3" /> Screenshots ({state.screenshots.length}/5)
            </label>

            {state.screenshots.length > 0 && (
              <div className="space-y-2 mb-3">
                {state.screenshots.map((src, i) => (
                  <ScreenshotCard
                    key={i}
                    src={src}
                    index={i}
                    itemLabel={testItem.label}
                    status={state.status}
                    comment={state.comment}
                    page={page}
                    route={route}
                    onRemove={() => onRemoveScreenshot(i)}
                    onOpenLightbox={onOpenLightbox}
                  />
                ))}
              </div>
            )}

            {state.screenshots.length < 5 && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) { await onAddScreenshot(file); e.target.value = ''; }
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-sky-400 hover:text-sky-500 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload screenshot
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

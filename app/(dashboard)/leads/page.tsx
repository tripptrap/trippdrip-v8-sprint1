"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getTemperatureDisplay } from "@/lib/leadScoring";
import CustomModal from "@/components/CustomModal";
import BulkComposeDrawer from "@/components/BulkComposeDrawer";

type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  zip_code?: string;
  tags?: string[];
  status?: string;
  score?: number;
  temperature?: 'hot' | 'warm' | 'cold';
  last_interaction_at?: string;
  conversation_state?: any;
  [k: string]: any;
};

type ConversationSession = {
  id: string;
  status: 'active' | 'completed' | 'recovered' | 'abandoned';
  started_at: string;
  last_activity_at: string;
  completed_at?: string;
  appointment_booked?: boolean;
  appointment_time?: string;
  collected_info?: any;
  conversation_history?: any[];
};

type LeadActivity = {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  metadata?: any;
};

type ImportSummary = {
  ok: boolean;
  incoming: number;
  added: number;
  duplicates: number;
  total: number;
  data_quality: { missing_name: number; missing_contact: number; invalid_state: number };
  top_states: { key: string; count: number }[];
  top_tags: { key: string; count: number }[];
  saved_to: string;
  error?: string;
};

type Campaign = {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  tags_applied?: string[];
  lead_ids?: string[];
  lead_count?: number;
};

type ModalState = {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
  confirmText?: string;
};

const CANON_FIELDS = ["first_name","last_name","phone","email","state","zip_code","tags","status"] as const;
type Canon = typeof CANON_FIELDS[number];
type MapType = Record<Canon, string | "">;

function normalizeTags(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v ?? "").split(/[,|]/).map(s=>s.trim()).filter(Boolean);
}
function cap(s: string){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<string>("");
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  /* Leads + filters */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hotLeadsOnly, setHotLeadsOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [recalculatingScores, setRecalculatingScores] = useState(false);

  /* Pagination */
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  /* Campaigns/Tags sources for dropdowns */
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tagsList, setTagsList] = useState<{ id?: string; name: string; color?: string; count: number }[]>([]);

  /* Dropdown UI */
  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [tagsMenuOpen, setTagsMenuOpen] = useState(false);

  /* Active dropdown selections (page-level filter) */
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  /* Disposition dropdown per lead */
  const [dispositionMenuOpen, setDispositionMenuOpen] = useState<{ [key: string]: boolean }>({});

  /* Lead details modal */
  const [selectedLeadDetails, setSelectedLeadDetails] = useState<string | null>(null);
  const [leadSessions, setLeadSessions] = useState<ConversationSession[]>([]);
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  const [leadMessages, setLeadMessages] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  /* Bulk actions */
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkDisposition, setBulkDisposition] = useState("");
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");
  const [bulkAddTagsDropdownOpen, setBulkAddTagsDropdownOpen] = useState(false);
  const [bulkNewTagInput, setBulkNewTagInput] = useState("");
  const [bulkNewTagColor, setBulkNewTagColor] = useState("#f59e0b");
  const [bulkRemoveTagsDropdownOpen, setBulkRemoveTagsDropdownOpen] = useState(false);
  const [bulkReplaceTagInput, setBulkReplaceTagInput] = useState("");
  const [bulkReplaceTagColor, setBulkReplaceTagColor] = useState("#f59e0b");
  const [bulkReplaceTags, setBulkReplaceTags] = useState<string[]>([]);
  const [bulkFollowUpTitle, setBulkFollowUpTitle] = useState("");
  const [bulkFollowUpNotes, setBulkFollowUpNotes] = useState("");
  const [bulkFollowUpDueDate, setBulkFollowUpDueDate] = useState("");
  const [bulkFollowUpPriority, setBulkFollowUpPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [reDripCampaignId, setReDripCampaignId] = useState("");
  const [reDripResetProgress, setReDripResetProgress] = useState(true);

  /* Bulk Schedule Message */
  const [bulkScheduleMessage, setBulkScheduleMessage] = useState("");
  const [bulkScheduleDate, setBulkScheduleDate] = useState("");
  const [schedulingBulk, setSchedulingBulk] = useState(false);

  /* Bulk Compose Drawer */
  const [composeDrawerOpen, setComposeDrawerOpen] = useState(false);

  /* Add Lead Modal */
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    state: "",
    zip_code: "",
    tags: "",
    status: "new",
    campaign_id: "" as string | null,
  });
  const [addingLead, setAddingLead] = useState(false);
  const [preselectedCampaignName, setPreselectedCampaignName] = useState("");

  /* Edit Lead Modal */
  const [editLeadOpen, setEditLeadOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [editTagsDropdownOpen, setEditTagsDropdownOpen] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) (Array.isArray(l.tags) ? l.tags : []).forEach(t => set.add(String(t)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [leads]);

  // Memoize combined tags for dropdowns (prevents O(n²) on every render)
  const availableTags = useMemo(() => {
    const combined = new Set<string>();
    tagsList.forEach(t => combined.add(t.name));
    allTags.forEach(t => combined.add(t));
    return Array.from(combined).sort();
  }, [tagsList, allTags]);

  // Cache demo mode check (avoid localStorage reads in render path)
  const [isDemoMode, setIsDemoMode] = useState(false);
  useEffect(() => {
    setIsDemoMode(typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true');
  }, []);

  // Handle URL params for pre-selecting campaign when adding lead
  useEffect(() => {
    const campaignId = searchParams.get('campaign_id');
    const campaignName = searchParams.get('campaign_name');

    if (campaignId) {
      setNewLead(prev => ({ ...prev, campaign_id: campaignId }));
      setPreselectedCampaignName(campaignName || '');
      setAddLeadOpen(true);
      // Clear URL params without reloading
      router.replace('/leads', { scroll: false });
    }
  }, [searchParams, router]);

  async function fetchLeads() {
    setLoading(true);
    try {
      // Use cached demo mode state (avoids localStorage read on every call)
      if (isDemoMode) {
        // Use demo data
        const { getDemoLeads } = await import('@/lib/demoData');
        const demoLeads = getDemoLeads();
        setLeads(demoLeads);
      } else {
        // Fetch real data with pagination
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (selectedTags.length) params.set("tags", selectedTags.join(","));
        params.set("page", String(currentPage));
        params.set("pageSize", String(pageSize));
        const res = await fetch(`/api/leads?${params.toString()}`);
        const data = await res.json();
        setLeads(Array.isArray(data?.items) ? data.items : []);
        setTotalCount(data?.total || 0);
      }
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchCampaigns() {
    try {
      const r = await fetch("/api/campaigns");
      const j = await r.json();
      setCampaigns(Array.isArray(j?.items) ? j.items : []);
    } catch { setCampaigns([]); }
  }
  async function fetchTags() {
    try {
      const r = await fetch("/api/tags");
      const j = await r.json();
      setTagsList(Array.isArray(j?.items) ? j.items : []);
    } catch { setTagsList([]); }
  }

  async function handleAddLead() {
    if (!newLead.first_name && !newLead.last_name) {
      setModal({ isOpen: true, type: 'error', title: 'Missing Name', message: 'Please enter at least a first or last name.' });
      return;
    }
    if (!newLead.phone.trim()) {
      setModal({ isOpen: true, type: 'error', title: 'Missing Phone', message: 'Phone number is required.' });
      return;
    }

    setAddingLead(true);
    try {
      const leadData = {
        ...newLead,
        tags: newLead.tags ? newLead.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        campaign_id: newLead.campaign_id || null,
      };

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const data = await res.json();

      if (data.ok || data.id) {
        setToast('Lead added successfully!');
        setTimeout(() => setToast(''), 2500);
        setAddLeadOpen(false);
        setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new", campaign_id: "" });
        setPreselectedCampaignName("");
        await fetchLeads();
      } else if (data.error === 'duplicate' && data.existingLead) {
        const lead = data.existingLead;
        const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
        const tags = Array.isArray(lead.tags) ? lead.tags.join(', ') : '';
        setModal({
          isOpen: true,
          type: 'confirm',
          title: 'Duplicate Lead',
          message: `A lead with this phone number already exists:\n\nName: ${name}\nPhone: ${lead.phone}\nEmail: ${lead.email || '—'}\nState: ${lead.state || '—'}${tags ? `\nTags: ${tags}` : ''}`,
          confirmText: 'View Lead',
          onConfirm: () => {
            setAddLeadOpen(false);
            setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new", campaign_id: "" });
            setPreselectedCampaignName("");
            viewLeadDetails(lead.id);
          }
        });
      } else {
        setModal({ isOpen: true, type: 'error', title: 'Error', message: data.error || 'Failed to add lead' });
      }
    } catch (err: any) {
      setModal({ isOpen: true, type: 'error', title: 'Error', message: err.message || 'Failed to add lead' });
    } finally {
      setAddingLead(false);
    }
  }

  function openEditLead(lead: any) {
    setEditingLead({
      id: lead.id,
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      state: lead.state || '',
      zip_code: lead.zip_code || '',
      tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
      status: lead.status || 'new',
      disposition: lead.disposition || ''
    });
    setEditLeadOpen(true);
  }

  async function handleSaveLead() {
    if (!editingLead) return;

    setSavingLead(true);
    try {
      const leadData = {
        first_name: editingLead.first_name?.trim() || null,
        last_name: editingLead.last_name?.trim() || null,
        phone: editingLead.phone?.trim() || null,
        email: editingLead.email?.trim() || null,
        state: editingLead.state?.trim() || null,
        zip_code: editingLead.zip_code?.trim() || null,
        tags: editingLead.tags ? editingLead.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        status: editingLead.status,
        disposition: editingLead.disposition || null
      };

      const res = await fetch(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const data = await res.json();

      if (data.ok) {
        setToast('Lead updated successfully!');
        setTimeout(() => setToast(''), 2500);
        const savedLeadId = editingLead.id;
        setEditLeadOpen(false);
        setEditingLead(null);
        setEditTagsDropdownOpen(false);
        await fetchLeads();
        // Reopen lead details with updated data
        viewLeadDetails(savedLeadId);
      } else {
        setModal({ isOpen: true, type: 'error', title: 'Error', message: data.error || 'Failed to update lead' });
      }
    } catch (err: any) {
      setModal({ isOpen: true, type: 'error', title: 'Error', message: err.message || 'Failed to update lead' });
    } finally {
      setSavingLead(false);
    }
  }

  async function deleteLead(id: string, name: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Lead',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/leads/delete?id=${id}`, { method: 'DELETE' });
          const data = await res.json();

          if (data.ok) {
            setToast('Lead deleted successfully');
            setTimeout(()=>setToast(''), 2500);
            await fetchLeads();
          } else {
            setToast(`Error: ${data.error || 'Failed to delete lead'}`);
            setTimeout(()=>setToast(''), 3500);
          }
        } catch (e: any) {
          setToast(`Error: ${e?.message || 'Failed to delete lead'}`);
          setTimeout(()=>setToast(''), 3500);
        }
      }
    });
  }

  async function deleteSelectedLeads() {
    if (selectedIds.size === 0) {
      setToast('No leads selected');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Leads',
      message: `Are you sure you want to delete ${selectedIds.size} lead(s)? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const ids = Array.from(selectedIds).join(',');
          const res = await fetch(`/api/leads/delete?ids=${ids}`, { method: 'DELETE' });
          const data = await res.json();

          if (data.ok) {
            setToast(`${data.deletedCount} lead(s) deleted successfully`);
            setTimeout(()=>setToast(''), 2500);
            setSelectedIds(new Set());
            await fetchLeads();
          } else {
            setToast(`Error: ${data.error || 'Failed to delete leads'}`);
            setTimeout(()=>setToast(''), 3500);
          }
        } catch (e: any) {
          setToast(`Error: ${e?.message || 'Failed to delete leads'}`);
          setTimeout(()=>setToast(''), 3500);
        }
      }
    });
  }

  async function updateDisposition(id: string, disposition: string) {
    try {
      const res = await fetch('/api/leads/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, disposition })
      });
      const data = await res.json();

      if (data.ok) {
        setToast(`Lead outcome updated to: ${disposition}`);
        setTimeout(()=>setToast(''), 2500);
        await fetchLeads();
      } else {
        setToast(`Error: ${data.error || 'Failed to update outcome'}`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to update outcome'}`);
      setTimeout(()=>setToast(''), 3500);
    }
  }

  async function bulkUpdate(updates: any) {
    if (selectedIds.size === 0) {
      setToast('No leads selected');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    try {
      // If marking as sold, use the disposition endpoint per lead to ensure client conversion
      if (updates.disposition === 'sold') {
        const ids = Array.from(selectedIds);
        let successCount = 0;
        for (const id of ids) {
          const res = await fetch('/api/leads/disposition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, disposition: 'sold' }),
          });
          const data = await res.json();
          if (data.ok) successCount++;
        }
        setToast(`${successCount} lead(s) converted to clients`);
        setTimeout(()=>setToast(''), 2500);
        setBulkActionModal(null);
        setBulkDisposition("");
        await fetchLeads();
        return;
      }

      const res = await fetch('/api/leads/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          updates
        })
      });
      const data = await res.json();

      if (data.ok) {
        setToast(`${data.updatedCount} lead(s) updated successfully`);
        setTimeout(()=>setToast(''), 2500);
        setBulkActionModal(null);
        setBulkStatus("");
        setBulkDisposition("");
        setBulkAddTags("");
        setBulkRemoveTags("");
        await fetchLeads();
      } else {
        setToast(`Error: ${data.error || 'Failed to update leads'}`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to update leads'}`);
      setTimeout(()=>setToast(''), 3500);
    }
  }

  async function bulkToggleAI(disable: boolean) {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : null;
    const scope = ids ? `${ids.length} selected` : 'all';

    setModal({
      isOpen: true,
      type: 'confirm',
      title: disable ? 'Disable AI' : 'Enable AI',
      message: `${disable ? 'Disable' : 'Enable'} AI responses for ${scope} lead conversations?`,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/threads/bulk-ai-toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadIds: ids, disable, all: !ids }),
          });
          const data = await res.json();
          if (data.ok) {
            setToast(`AI ${disable ? 'disabled' : 'enabled'} for ${data.updated || 0} conversation(s)`);
          } else {
            setToast(`Error: ${data.error}`);
          }
        } catch {
          setToast('Failed to toggle AI');
        }
        setTimeout(() => setToast(''), 3000);
        setBulkActionsOpen(false);
      },
    });
  }

  async function bulkDeleteLeads() {
    if (selectedIds.size === 0) {
      setToast('No leads selected');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Leads',
      message: `Delete ${selectedIds.size} selected lead(s)? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/leads/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadIds: Array.from(selectedIds)
            })
          });
          const data = await res.json();

          if (data.ok) {
            setToast(`${data.deletedCount} lead(s) deleted successfully`);
            setTimeout(()=>setToast(''), 2500);
            setBulkActionModal(null);
            setSelectedIds(new Set());
            await fetchLeads();
          } else {
            setToast(`Error: ${data.error || 'Failed to delete leads'}`);
            setTimeout(()=>setToast(''), 3500);
          }
        } catch (e: any) {
          setToast(`Error: ${e?.message || 'Failed to delete leads'}`);
          setTimeout(()=>setToast(''), 3500);
        }
      }
    });
  }

  async function bulkCreateFollowUps() {
    if (selectedIds.size === 0) {
      setToast('No leads selected');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    if (!bulkFollowUpTitle || !bulkFollowUpDueDate) {
      setToast('Title and due date are required');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    try {
      const res = await fetch('/api/follow-ups/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          title: bulkFollowUpTitle,
          notes: bulkFollowUpNotes,
          due_date: bulkFollowUpDueDate,
          priority: bulkFollowUpPriority
        })
      });
      const data = await res.json();

      if (data.ok) {
        setToast(`${data.createdCount} follow-up(s) created successfully`);
        setTimeout(()=>setToast(''), 2500);
        setBulkActionModal(null);
        setBulkFollowUpTitle("");
        setBulkFollowUpNotes("");
        setBulkFollowUpDueDate("");
        setBulkFollowUpPriority('medium');
        setSelectedIds(new Set());
      } else {
        setToast(`Error: ${data.error || 'Failed to create follow-ups'}`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to create follow-ups'}`);
      setTimeout(()=>setToast(''), 3500);
    }
  }

  async function exportLeads(format: 'csv' | 'json') {
    if (selectedIds.size === 0) {
      setToast('No leads selected');
      setTimeout(()=>setToast(''), 2500);
      return;
    }

    try {
      const res = await fetch('/api/leads/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          format
        })
      });

      if (format === 'csv') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setToast('CSV exported successfully');
        setTimeout(()=>setToast(''), 2500);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data.leads, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setToast('JSON exported successfully');
        setTimeout(()=>setToast(''), 2500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to export leads'}`);
      setTimeout(()=>setToast(''), 3500);
    }
  }

  async function exportAllLeads() {
    try {
      const res = await fetch('/api/leads?pageSize=10000');
      const data = await res.json();
      const allLeads = data.items || data.leads || [];

      if (allLeads.length === 0) {
        setToast('No leads to export');
        setTimeout(() => setToast(''), 2500);
        return;
      }

      // Build CSV
      const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'State', 'Zip Code', 'Status', 'Tags', 'Created At'];
      const rows = allLeads.map((l: any) => [
        l.first_name || '',
        l.last_name || '',
        l.phone || '',
        l.email || '',
        l.state || '',
        l.zip_code || '',
        l.status || '',
        Array.isArray(l.tags) ? l.tags.join('; ') : '',
        l.created_at ? new Date(l.created_at).toLocaleDateString() : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row: string[]) =>
          row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setToast(`Exported ${allLeads.length} leads to CSV`);
      setTimeout(() => setToast(''), 2500);
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to export leads'}`);
      setTimeout(() => setToast(''), 3500);
    }
  }

  async function recalculateLeadScores() {
    setRecalculatingScores(true);
    try {
      const res = await fetch('/api/leads/recalculate-scores', {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        setToast(`✓ ${data.message}`);
        setTimeout(()=>setToast(''), 3000);
        await fetchLeads();
      } else {
        setToast(`Error: ${data.error || 'Failed to recalculate scores'}`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to recalculate scores'}`);
      setTimeout(()=>setToast(''), 3500);
    } finally {
      setRecalculatingScores(false);
    }
  }

  async function viewLeadDetails(leadId: string) {
    setSelectedLeadDetails(leadId);
    setLoadingDetails(true);
    setLeadSessions([]);
    setLeadActivities([]);
    setLeadMessages([]);

    // Get the lead to find their phone number
    const lead = leads.find(l => String(l.id) === leadId);
    const phone = lead?.phone;

    try {
      // Fetch sessions for this lead
      const sessionsRes = await fetch(`/api/conversations/sessions?leadId=${leadId}`);
      const sessionsData = await sessionsRes.json();
      if (sessionsData.ok) {
        setLeadSessions(sessionsData.sessions || []);
      }

      // Fetch activities for this lead
      const activitiesRes = await fetch(`/api/leads/activities?leadId=${leadId}`);
      const activitiesData = await activitiesRes.json();
      if (activitiesData.ok) {
        setLeadActivities(activitiesData.activities || []);
      }

      // Fetch messages for this lead (by lead_id first, then phone as fallback)
      const msgParams = new URLSearchParams();
      msgParams.set('leadId', leadId);
      if (phone) msgParams.set('phone', phone);
      const messagesRes = await fetch(`/api/messages/by-phone?${msgParams.toString()}`);
      const messagesData = await messagesRes.json();
      if (messagesData.ok) {
        setLeadMessages(messagesData.messages || []);
      }
    } catch (error) {
      console.error('Error fetching lead details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  // Initial load - fetch campaigns and tags once
  useEffect(() => { fetchCampaigns(); fetchTags(); }, []);

  // Fetch leads when filters/pagination change (also handles initial load)
  useEffect(() => { fetchLeads(); }, [q, selectedTags, currentPage, pageSize]);

  // Reset to page 1 when search/tag filters change (but not on mount)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setCurrentPage(1);
  }, [q, selectedTags]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // If click is not inside a disposition menu, close all
      if (!target.closest('[data-disposition-menu]')) {
        setDispositionMenuOpen({});
      }
      // Also close campaign and tags menus
      if (!target.closest('[data-campaign-menu]')) {
        setCampaignMenuOpen(false);
      }
      if (!target.closest('[data-tags-menu]')) {
        setTagsMenuOpen(false);
      }
      if (!target.closest('[data-bulk-actions-menu]')) {
        setBulkActionsOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  /* Derived: apply page-level campaign/tag filters + auto-sort by score + hot leads filter */
  const filtered = useMemo(() => {
    let arr = [...leads];

    // Filter archived leads - show only archived when showArchived is true, hide them otherwise
    if (showArchived) {
      arr = arr.filter(l => l.status === 'archived');
    } else {
      arr = arr.filter(l => l.status !== 'archived');
    }

    // Apply campaign filter - filter by lead's campaign_id
    if (activeCampaignId) {
      arr = arr.filter(l => l.campaign_id === activeCampaignId);
    }

    // Apply tag filter
    if (activeTagFilter) {
      arr = arr.filter(l => Array.isArray(l.tags) && l.tags.includes(activeTagFilter));
    }

    // Apply hot leads only filter
    if (hotLeadsOnly) {
      arr = arr.filter(l => l.temperature === 'hot');
    }

    // Auto-sort by score (highest first)
    arr.sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      return scoreB - scoreA;
    });

    return arr;
  }, [leads, activeCampaignId, activeTagFilter, campaigns, hotLeadsOnly, showArchived]);

  const allVisibleSelected = useMemo(() => {
    if (!filtered.length) return false;
    for (const l of filtered) { if (!selectedIds.has(String(l.id ?? ""))) return false; }
    return true;
  }, [filtered, selectedIds]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const n = new Set(prev);
        for (const l of filtered) n.delete(String(l.id ?? ""));
        return n;
      });
    } else {
      setSelectedIds(prev => {
        const n = new Set(prev);
        for (const l of filtered) n.add(String(l.id ?? ""));
        return n;
      });
    }
  }, [allVisibleSelected, filtered]);

  // allLeadsSelected is the same as allVisibleSelected - use that instead
  const allLeadsSelected = allVisibleSelected;

  const selectAllLeads = useCallback(() => {
    const n = new Set<string>();
    for (const l of filtered) n.add(String(l.id ?? ""));
    setSelectedIds(n);
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleTagChip = useCallback((tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t=>t!==tag) : [...prev, tag]);
  }, []);

  /* Upload modal + import */
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<ImportSummary | null>(null);
  const [raw, setRaw] = useState<{ ok:boolean; detectedType?:string; total?:number; preview?:any[]; all?:any[]; error?:string } | null>(null);

  const [campaignName, setCampaignName] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [uploadTagsDropdownOpen, setUploadTagsDropdownOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [uploadCampaignDropdownOpen, setUploadCampaignDropdownOpen] = useState(false);
  const [newCampaignInput, setNewCampaignInput] = useState("");
  const [newTagColor, setNewTagColor] = useState("#f59e0b");

  const detectedColumns = useMemo<string[]>(() => {
    const first = raw?.preview?.[0] || {};
    return Object.keys(first);
  }, [raw]);

  const initialMap = useMemo<MapType>(() => {
    const m: MapType = { first_name:"", last_name:"", phone:"", email:"", state:"", zip_code:"", tags:"", status:"" };
    const cols = detectedColumns.map(c => [c, c.toLowerCase()] as const);
    for (const [orig, low] of cols) {
      if (low.includes("first")) m.first_name ||= orig;
      else if (low.includes("last")) m.last_name ||= orig;
      else if (/phone|cell|mobile|tel/.test(low)) m.phone ||= orig;
      else if (low.includes("mail")) m.email ||= orig;
      else if (low === "state" || low.includes("state")) m.state ||= orig;
      else if (low.includes("zip") || low.includes("postal")) m.zip_code ||= orig;
      else if (low.includes("tag") || low.includes("label")) m.tags ||= orig;
      else if (low === "status") m.status ||= orig;
      else if (low === "name" || low.includes("full name")) { if (!m.first_name) m.first_name = orig; }
    }
    return m;
  }, [detectedColumns]);

  const [mapping, setMapping] = useState<MapType>(initialMap);
  useEffect(() => { setMapping(initialMap); }, [initialMap]);

  function assignMapping(field: Canon, col: string) {
    setMapping(prev => {
      const next: MapType = { ...prev };
      for (const f of CANON_FIELDS) if (next[f] === col) next[f] = "";
      next[field] = col;
      return next;
    });
  }
  function clearMapping(field: Canon){ setMapping(p => ({ ...p, [field]: "" })); }

  function transformRows(rows: any[], map: MapType): Lead[] {
    return rows.map((r) => {
      const l: Lead = {};
      if (map.first_name) l.first_name = String(r[map.first_name] ?? "").trim();
      if (map.last_name)  l.last_name  = String(r[map.last_name] ?? "").trim();
      if (map.email) l.email = String(r[map.email] ?? "").trim();
      if (map.phone) {
        const digits = String(r[map.phone] ?? "").replace(/\D/g,"");
        l.phone = digits ? (digits.length===10 ? `+1${digits}` : `+${digits}`) : "";
      }
      if (map.state) l.state = String(r[map.state] ?? "").trim().toUpperCase();
      if (map.tags)  l.tags  = normalizeTags(r[map.tags]);
      if (map.status) l.status = String(r[map.status] ?? "").trim() || "Active";
      if (!l.first_name && !l.last_name && l.email) {
        const user = l.email.split("@")[0] || "";
        const parts = user.split(/[._-]+/).filter(Boolean);
        if (parts.length >= 2) {
          const [a,b] = parts;
          if (a.length <= b.length) { l.first_name = cap(a); l.last_name = cap(b); }
          else { l.first_name = cap(b); l.last_name = cap(a); }
        } else if (parts.length === 1) {
          l.first_name = cap(parts[0]);
        }
      }
      if (!l.status) l.status = "Active";
      return l;
    });
  }

  const mappedPreview: Lead[] = useMemo(() => raw?.preview ? transformRows(raw.preview, mapping) : [], [raw, mapping]);
  const mappedAll: Lead[] = useMemo(() => raw?.all ? transformRows(raw.all, mapping) : [], [raw, mapping]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setRaw(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const json = await res.json();
      setRaw(json);
    } catch (err: any) {
      setRaw({ ok:false, error: err?.message || "Upload failed" } as any);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleAIParse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'AI Parse Document',
      message: `AI will parse "${file.name}" and extract lead information.\n\nThis costs 3 points. Continue?`,
      onConfirm: async () => {
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("campaignName", "");
          fd.append("tags", "[]");

          const res = await fetch("/api/leads/upload-document", {
            method: "POST",
            body: fd,
          });

          const result = await res.json();

          if (result.success) {
            setToast(
              `${result.message}\n` +
              `Points used: ${result.pointsUsed || 0}`
            );
            fetchLeads();
          } else {
            setModal({
              isOpen: true,
              type: 'error',
              title: 'Error',
              message: `Error: ${result.error || "Failed to parse document"}`
            });
          }
        } catch (err: any) {
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: `Error: ${err?.message || "Upload failed"}`
          });
        } finally {
          setBusy(false);
          e.target.value = "";
        }
      }
    });

    if (!modal.isOpen) {
      e.target.value = "";
    }
  }

  const canImport = !!(raw?.ok && (raw?.total || 0) > 0);

  async function onImport() {
    if (!canImport) return;
    try {
      const payload = {
        items: mappedAll.length ? mappedAll : [],
        campaignName: campaignName.trim() || undefined,
        addTags: normalizeTags(bulkTags)
      };
      console.log("[Import Frontend] Sending payload:", payload);
      console.log("[Import Frontend] campaignName value:", campaignName);
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      console.log("[Import Frontend] Response:", json);
      setOpen(false);
      if (json?.ok) {
        setLastSummary({
          ok: true,
          incoming: raw?.total || 0,
          added: mappedAll.length,
          duplicates: 0,
          total: (json?.total || mappedAll.length),
          data_quality: { missing_name: 0, missing_contact: 0, invalid_state: 0 },
          top_states: [],
          top_tags: [],
          saved_to: "data/leads.json",
        });
        setToast("leads successfully uploaded");
        setTimeout(()=>setToast(""), 3000);
        await fetchLeads();
        await fetchCampaigns();
        await fetchTags();
      } else {
        setToast(`Error: ${json?.error || "Import failed"}`);
        setTimeout(()=>setToast(""), 5000);
      }
    } catch (e:any) {
      setOpen(false);
      setToast(`Error: ${e?.message || "Import failed"}`);
      setTimeout(()=>setToast(""), 5000);
    }
  }

  /* RUN CAMPAIGN: select ONLY from saved campaigns */
  const [runOpen, setRunOpen] = useState(false);
  const [runCampaignId, setRunCampaignId] = useState<string>(""); // must pick from saved
  const [runTags, setRunTags] = useState<string[]>([]);
  const [runTagsDropdownOpen, setRunTagsDropdownOpen] = useState(false);
  const [runNewTagInput, setRunNewTagInput] = useState("");
  const [runNewTagColor, setRunNewTagColor] = useState("#f59e0b");
  const [runScope, setRunScope] = useState<"selected"|"filtered">("selected");
  const [runZipCodes, setRunZipCodes] = useState(""); // comma-separated zip codes to filter by
  const [runStates, setRunStates] = useState<string[]>([]); // states to filter by
  const [runStatesDropdownOpen, setRunStatesDropdownOpen] = useState(false);
  const [running, setRunning] = useState(false);

  async function runCampaign() {
    let leadsToRun = runScope === "selected"
      ? leads.filter(l => selectedIds.has(String(l.id ?? "")))
      : filtered;

    // Filter by states if provided
    if (runStates.length > 0) {
      leadsToRun = leadsToRun.filter(l => l.state && runStates.includes(l.state));
    }

    // Filter by zip codes if provided
    if (runZipCodes.trim()) {
      const zipCodesArray = runZipCodes.split(',').map(z => z.trim()).filter(Boolean);
      if (zipCodesArray.length > 0) {
        leadsToRun = leadsToRun.filter(l => l.zip_code && zipCodesArray.includes(l.zip_code));
      }
    }

    let ids = leadsToRun.map(l => String(l.id ?? ""));

    if (ids.length === 0 && (runStates.length > 0 || runZipCodes.trim())) {
      setToast(`No leads found with the selected filters`);
      setTimeout(()=>setToast(""), 3500);
      return;
    }

    if (!ids.length) {
      setToast("select leads first or switch to filtered");
      setTimeout(()=>setToast(""), 2500);
      return;
    }
    if (!runCampaignId) {
      setToast("choose a saved campaign");
      setTimeout(()=>setToast(""), 2500);
      return;
    }
    const camp = campaigns.find(c => c.id === runCampaignId);
    const campaignNameOnly = camp?.name || "";
    if (!campaignNameOnly) {
      setToast("invalid campaign");
      setTimeout(()=>setToast(""), 2500);
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: ids,
          campaignName: campaignNameOnly,            // ONLY saved campaigns allowed
          addTags: runTags
        })
      });
      const j = await res.json();
      if (j?.ok) {
        setRunOpen(false);
        setRunCampaignId("");
        setRunTags([]);
        setRunTagsDropdownOpen(false);
        setRunZipCodes("");
        setRunStates([]);
        setRunStatesDropdownOpen(false);
        setSelectedIds(new Set());
        setToast("campaign started");
        setTimeout(()=>setToast(""), 2500);
        await fetchLeads();
        await fetchCampaigns();
        await fetchTags();
      } else {
        setToast(`Error: ${j?.error || "run failed"}`);
        setTimeout(()=>setToast(""), 3500);
      }
    } catch (e:any) {
      setToast(`Error: ${e?.message || "run failed"}`);
      setTimeout(()=>setToast(""), 3500);
    } finally {
      setRunning(false);
    }
  }

  /* Hotkeys + closing */
  useEffect(() => {
    function onKey(e: KeyboardEvent){
      const metaS = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (metaS && open && canImport) { e.preventDefault(); onImport(); return; }
      if (e.key === "Escape") {
        if (open) setOpen(false);
        else if (runOpen) setRunOpen(false);
        else { setCampaignMenuOpen(false); setTagsMenuOpen(false); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, runOpen, canImport]);

  function backdropClick() {
    if (runOpen) { setRunOpen(false); return; }
    setOpen(false);
  }
  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <div className="text-slate-900 dark:text-slate-100">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-600 shadow">
          {toast}
        </div>
      )}

      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText || (modal.type === 'confirm' ? 'Confirm' : 'OK')}
        cancelText="Cancel"
      />

      {/* Add Lead Modal */}
      {addLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add New Lead</h3>
              <button onClick={() => { setAddLeadOpen(false); setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new", campaign_id: "" }); setPreselectedCampaignName(""); }} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xl">&times;</button>
            </div>
            {preselectedCampaignName && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800">
                <p className="text-sm text-sky-700 dark:text-sky-300">
                  <span className="font-medium">Adding to campaign:</span> {preselectedCampaignName}
                </p>
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newLead.first_name}
                    onChange={(e) => setNewLead({ ...newLead, first_name: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLead.last_name}
                    onChange={(e) => setNewLead({ ...newLead, last_name: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">State</label>
                  <input
                    type="text"
                    value={newLead.state}
                    onChange={(e) => setNewLead({ ...newLead, state: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={newLead.zip_code}
                    onChange={(e) => setNewLead({ ...newLead, zip_code: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-sky-500"
                    placeholder="90210"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Pipeline Tags</label>
                <div className="flex flex-wrap gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 min-h-[38px]">
                  {tagsList.length === 0 && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">No tags created yet</span>
                  )}
                  {tagsList.map(tag => {
                    const selected = (newLead.tags || "").split(",").filter(Boolean).includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        onClick={() => {
                          const current = (newLead.tags || "").split(",").filter(Boolean);
                          const updated = selected ? current.filter(t => t !== tag.name) : [...current, tag.name];
                          setNewLead({ ...newLead, tags: updated.join(",") });
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                          selected
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-400'
                            : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || '#94a3b8' }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Campaign</label>
                <select
                  value={newLead.campaign_id || ""}
                  onChange={(e) => setNewLead({ ...newLead, campaign_id: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                >
                  <option value="">No Campaign</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setAddLeadOpen(false); setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new", campaign_id: "" }); setPreselectedCampaignName(""); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={addingLead}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {addingLead ? 'Adding...' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {editLeadOpen && editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Lead</h3>
              <button onClick={() => { setEditLeadOpen(false); setEditingLead(null); setEditTagsDropdownOpen(false); }} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editingLead.first_name}
                    onChange={(e) => setEditingLead({ ...editingLead, first_name: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editingLead.last_name}
                    onChange={(e) => setEditingLead({ ...editingLead, last_name: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={editingLead.phone}
                  onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={editingLead.email}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">State</label>
                  <input
                    type="text"
                    value={editingLead.state}
                    onChange={(e) => setEditingLead({ ...editingLead, state: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={editingLead.zip_code}
                    onChange={(e) => setEditingLead({ ...editingLead, zip_code: e.target.value })}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                    placeholder="90210"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Pipeline Tags</label>
                <div className="flex flex-wrap gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 min-h-[38px]">
                  {tagsList.length === 0 && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">No tags created yet</span>
                  )}
                  {tagsList.map(tag => {
                    const currentTags = editingLead.tags ? editingLead.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
                    const selected = currentTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        type="button"
                        onClick={() => {
                          const updated = selected ? currentTags.filter((t: string) => t !== tag.name) : [...currentTags, tag.name];
                          setEditingLead({ ...editingLead, tags: updated.join(', ') });
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                          selected
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-400'
                            : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || '#94a3b8' }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Campaign</label>
                <select
                  value={editingLead.campaign_id || ""}
                  onChange={(e) => setEditingLead({ ...editingLead, campaign_id: e.target.value })}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500"
                >
                  <option value="">No Campaign</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setEditLeadOpen(false); setEditingLead(null); setEditTagsDropdownOpen(false); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLead}
                disabled={savingLead}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {savingLead ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold">{showArchived ? 'Archived Leads' : 'Leads'}</h2>
          <div className="flex flex-wrap gap-2 relative">
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Search name, email, phone, state, tag…"
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none w-full sm:w-[260px]"
            />

            {/* Action Buttons Group - prominent styling */}
            <button
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition shadow-sm"
              onClick={() => setAddLeadOpen(true)}
            >
              + Add Lead
            </button>
            <button
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 transition shadow-sm"
              onClick={() => { setOpen(true); setRaw(null); setCampaignName(""); setBulkTags(""); setUploadTagsDropdownOpen(false); setNewTagInput(""); setNewTagColor("#f59e0b"); setUploadCampaignDropdownOpen(false); setNewCampaignInput(""); }}
            >
              Upload Leads
            </button>
            <button
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 transition shadow-sm"
              onClick={() => setRunOpen(true)}
            >
              Run Campaign
            </button>
            <button
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition shadow-sm"
              onClick={() => setComposeDrawerOpen(true)}
            >
              Compose
            </button>
            {/* Divider */}
            <div className="h-8 w-px bg-slate-300 dark:bg-slate-600"></div>

            {/* Filter Buttons Group - muted styling */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-1">
              {/* Campaigns dropdown (page filter) */}
              <div className="relative" data-campaign-menu>
                <button
                  className={`rounded-md px-3 py-1.5 text-sm min-w-[120px] text-left transition ${activeCampaignId ? 'bg-slate-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  onClick={()=>{ setCampaignMenuOpen(v=>!v); setTagsMenuOpen(false); }}
                >
                  {activeCampaignId
                    ? campaigns.find(c=>c.id===activeCampaignId)?.name || "Selected"
                    : "Campaigns"}
                </button>
                {campaignMenuOpen && (
                  <div className="absolute right-0 mt-1 w-[calc(100vw-32px)] sm:w-[280px] max-w-[280px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-10">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={()=>{ setActiveCampaignId(null); setCampaignMenuOpen(false); }}
                    >
                      All campaigns
                    </button>
                    <div className="max-h-[260px] overflow-auto">
                      {campaigns.length===0 && (
                        <div className="px-3 py-2 text-slate-600 dark:text-slate-400 text-sm">No campaigns yet</div>
                      )}
                      {campaigns.map(c=>{
                        const leadCount = leads.filter(l => l.campaign_id === c.id).length;
                        return (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                            onClick={()=>{ setActiveCampaignId(c.id); setCampaignMenuOpen(false); }}
                          >
                            {c.name} <span className="text-slate-600 dark:text-slate-400">({leadCount})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Tags dropdown (page filter) */}
              <div className="relative" data-tags-menu>
                <button
                  className={`rounded-md px-3 py-1.5 text-sm min-w-[100px] text-left transition ${activeTagFilter ? 'bg-slate-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  onClick={()=>{ setTagsMenuOpen(v=>!v); setCampaignMenuOpen(false); }}
                >
                  {activeTagFilter ? activeTagFilter : "Tags"}
                </button>
                {tagsMenuOpen && (
                  <div className="absolute right-0 mt-1 w-[calc(100vw-32px)] sm:w-[240px] max-w-[240px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-10">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={()=>{ setActiveTagFilter(null); setTagsMenuOpen(false); }}
                    >
                      All tags
                    </button>
                    <div className="max-h-[260px] overflow-auto">
                      {tagsList.length===0 && (
                        <div className="px-3 py-2 text-slate-600 dark:text-slate-400 text-sm">No tags yet</div>
                      )}
                      {tagsList.map(t=>(
                        <button
                          key={t.name}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                          onClick={()=>{ setActiveTagFilter(t.name); setTagsMenuOpen(false); }}
                        >
                          {t.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                          {t.name} <span className="text-slate-600 dark:text-slate-400">({t.count})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${hotLeadsOnly ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onClick={() => { setHotLeadsOnly(v => !v); if (!hotLeadsOnly) setShowArchived(false); }}
                title="Filter for hot leads (score >= 70)"
              >
                Hot Leads
              </button>

              <label className={`rounded-md px-3 py-1.5 text-sm cursor-pointer transition text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700`}>
                AI Parse
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.txt,.json,.pdf,.doc,.docx,.xlsx,.xls"
                  onChange={handleAIParse}
                />
              </label>

              <button
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition"
                onClick={recalculateLeadScores}
                disabled={recalculatingScores}
                title="Recalculate lead scores based on engagement"
              >
                {recalculatingScores ? '...' : 'Scores'}
              </button>

              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${showArchived ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onClick={() => { setShowArchived(v => !v); if (!showArchived) setHotLeadsOnly(false); }}
                title="Show archived leads"
              >
                Archived
              </button>

              {/* Select All / Clear Selection buttons */}
              <button
                className="rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition disabled:opacity-50"
                onClick={selectAllLeads}
                disabled={filtered.length === 0 || allLeadsSelected}
              >
                {allLeadsSelected ? '✓ All Selected' : `Select All (${filtered.length})`}
              </button>
              {selectedIds.size > 0 && (
                <button
                  className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-400 hover:bg-red-600/20 transition"
                  onClick={clearSelection}
                >
                  Clear ({selectedIds.size})
                </button>
              )}
            </div>
            {selectedIds.size > 0 && (
              <>
                <div className="relative" data-bulk-actions-menu>
                  <button
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setBulkActionsOpen(v => !v)}
                  >
                    Bulk Actions ({selectedIds.size})
                  </button>
                  {bulkActionsOpen && (
                    <div className="absolute right-0 mt-1 w-[220px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-lg z-50 max-h-[70vh] overflow-y-auto">
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setBulkActionModal('status'); setBulkActionsOpen(false); }}
                      >
                        Update Status
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setBulkActionModal('disposition'); setBulkActionsOpen(false); }}
                      >
                        Update Outcome
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setBulkActionModal('addTags'); setBulkActionsOpen(false); }}
                      >
                        Add Tags
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setBulkActionModal('removeTags'); setBulkActionsOpen(false); }}
                      >
                        Remove Tags
                      </button>
                      <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setBulkActionModal('createFollowUps'); setBulkActionsOpen(false); }}
                      >
                        Create Follow-ups
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-amber-500"
                        onClick={() => { setBulkActionModal('scheduleMessage'); setBulkActionsOpen(false); }}
                      >
                        📅 Schedule Message
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-sky-600"
                        onClick={() => { setBulkActionModal('reDrip'); setBulkActionsOpen(false); }}
                      >
                        🔄 Re-Drip to Campaign
                      </button>
                      <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { bulkToggleAI(false); setBulkActionsOpen(false); }}
                      >
                        Enable AI (Selected)
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { bulkToggleAI(true); setBulkActionsOpen(false); }}
                      >
                        Disable AI (Selected)
                      </button>
                      <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { exportLeads('csv'); setBulkActionsOpen(false); }}
                      >
                        Export to CSV
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { exportLeads('json'); setBulkActionsOpen(false); }}
                      >
                        Export to JSON
                      </button>
                      <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                      {showArchived ? (
                        <button
                          className="w-full text-left px-3 py-2 text-sm text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700"
                          onClick={() => { bulkUpdate({ status: 'new' }); setBulkActionsOpen(false); }}
                        >
                          📤 Unarchive Selected
                        </button>
                      ) : (
                        <button
                          className="w-full text-left px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={() => { bulkUpdate({ status: 'archived' }); setBulkActionsOpen(false); }}
                        >
                          📦 Archive Selected
                        </button>
                      )}
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        onClick={() => { setBulkActionModal('delete'); setBulkActionsOpen(false); }}
                      >
                        Delete Selected
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Optional tag chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {allTags.map(tag => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={()=>toggleTagChip(tag)}
                  className={`px-2 py-1 rounded-full text-xs border ${active ? "bg-sky-100 dark:bg-sky-900/30 border-sky-500" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={()=>setSelectedTags([])}
                className="px-2 py-1 rounded-full text-xs border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Clear chips
              </button>
            )}
          </div>
        )}

        {/* Getting Started Tips */}
        {filtered.length === 0 && !q && !activeCampaignId && !activeTagFilter && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <h3 className="text-lg font-semibold mb-3 text-sky-500 dark:text-sky-400">💡 Getting Started</h3>
            <ol className="text-sm text-slate-900 dark:text-slate-100 space-y-2 list-decimal list-inside">
              <li>
                <strong>Upload Leads:</strong> Click "Upload Leads" to import your contact list. <span className="text-slate-600 dark:text-slate-400">Add leads manually, import from CSV, or capture them automatically.</span>
              </li>
              <li>
                <strong>Assign Campaigns & Tags:</strong> Campaigns categorize what kind of lead they are (e.g., "Health", "Auto", "Solar"). <span className="text-slate-600 dark:text-slate-400">Tags track where the lead is in your pipeline (e.g., "New", "Contacted", "Quoted", "Appointment Set").</span>
              </li>
              <li>
                <strong>Create a Flow:</strong> Visit the <a href="/templates" className="text-sky-600 hover:underline">Flows</a> page to set up AI conversation templates. <span className="text-slate-600 dark:text-slate-400">Flows qualify your leads by gathering required info and booking appointments automatically.</span>
              </li>
              <li>
                <strong>Send Messages:</strong> Send individual SMS, bulk messages, or let your AI Flows handle conversations. <span className="text-slate-600 dark:text-slate-400">Visit <a href="/texts" className="text-sky-600 hover:underline">Messages</a> to view and manage all conversations.</span>
              </li>
            </ol>
          </div>
        )}

        {/* Leads table */}
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-sm min-w-max">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-700 dark:text-slate-200">
                <th className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                {["Score","Name","Campaign","Email","Phone","State","Tags","Status",""].map(h => (
                  <th key={h} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={11}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={11}>No leads found.</td></tr>
              )}
              {!loading && filtered.map((l, i) => {
                const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
                const id = String(l.id ?? i);
                const checked = selectedIds.has(id);
                const isMenuOpen = dispositionMenuOpen[id] || false;
                const score = l.score ?? null;
                const temperature = l.temperature || null;
                const tempDisplay = temperature ? getTemperatureDisplay(temperature) : null;

                return (
                  <tr key={id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800 cursor-pointer transition" onClick={() => viewLeadDetails(id)}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleRow(id)} />
                    </td>
                    <td className="px-3 py-2">
                      {score !== null && tempDisplay ? (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${tempDisplay.bg} ${tempDisplay.color}`}>
                            <span>{tempDisplay.icon}</span>
                            <span>{score}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2">
                      {l.campaign_id ? (
                        <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs truncate max-w-[120px]">
                          {campaigns.find(c => c.id === l.campaign_id)?.name || "—"}
                        </span>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.email || "—"}</td>
                    <td className="px-3 py-2">{l.phone || "—"}</td>
                    <td className="px-3 py-2">{l.state || "—"}</td>
                    <td className="px-3 py-2">
                      {Array.isArray(l.tags) && l.tags.length ? (
                        <div className="flex flex-wrap gap-1">
                          {l.primary_tag && l.tags.includes(l.primary_tag) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700">
                              {l.primary_tag}
                            </span>
                          )}
                          {l.tags.filter((t: string) => t !== l.primary_tag).length > 0 && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {l.primary_tag ? `+${l.tags.length - 1}` : l.tags.join(", ")}
                            </span>
                          )}
                          {!l.primary_tag && l.tags.length === 0 && "—"}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">{l.status || "—"}</td>
                    <td className="px-3 py-2 relative" onClick={(e) => e.stopPropagation()} data-disposition-menu>
                      <button
                        className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDispositionMenuOpen(prev => ({ ...prev, [id]: !prev[id] }));
                        }}
                      >
                        ···
                      </button>
                      {isMenuOpen && (
                        <div className="absolute right-0 mt-1 w-[200px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-10">
                          {/* Mark as Sold */}
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDisposition(id, 'sold');
                              setDispositionMenuOpen({});
                            }}
                          >
                            ✓ Mark as Sold
                          </button>
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDisposition(id, 'not_interested');
                              setDispositionMenuOpen({});
                            }}
                          >
                            ✗ Not Interested
                          </button>
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          {/* Pipeline (Tags) */}
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Pipeline Stage</div>
                          {tagsList.slice(0, 6).map(tag => (
                            <button
                              key={tag.name}
                              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const currentTags = Array.isArray(l.tags) ? l.tags : [];
                                if (!currentTags.includes(tag.name)) {
                                  await fetch(`/api/leads/${id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ tags: [...currentTags, tag.name], primary_tag: tag.name }),
                                  });
                                  setToast(`Added to "${tag.name}"`);
                                  setTimeout(() => setToast(''), 2500);
                                  fetchLeads();
                                } else {
                                  setToast(`Already tagged "${tag.name}"`);
                                  setTimeout(() => setToast(''), 2500);
                                }
                                setDispositionMenuOpen({});
                              }}
                            >
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                              {tag.name}
                              {Array.isArray(l.tags) && l.tags.includes(tag.name) && <span className="ml-auto text-xs text-sky-500">✓</span>}
                            </button>
                          ))}
                          {campaigns.length > 0 && (
                            <>
                              <div className="border-t border-slate-200 dark:border-slate-700" />
                              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Campaign</div>
                              {campaigns.slice(0, 5).map(c => (
                                <button
                                  key={c.id}
                                  className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await fetch(`/api/leads/${id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ campaign_id: c.id }),
                                    });
                                    setToast(`Assigned to campaign "${c.name}"`);
                                    setTimeout(() => setToast(''), 2500);
                                    fetchLeads();
                                    setDispositionMenuOpen({});
                                  }}
                                >
                                  {c.name}
                                  {l.campaign_id === c.id && <span className="ml-1 text-xs text-sky-500">✓</span>}
                                </button>
                              ))}
                            </>
                          )}
                          <div className="border-t border-slate-200 dark:border-slate-700" />
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLead(id, name);
                              setDispositionMenuOpen({});
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()} leads
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="text-sm border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-400 px-2">
                  Page {currentPage} of {Math.max(1, Math.ceil(totalCount / pageSize))}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                  className="px-3 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {lastSummary?.ok && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Last import</div>
            <div className="flex flex-wrap gap-x-6">
              <div><b>Incoming:</b> {lastSummary.incoming}</div>
              <div><b>Added:</b> {lastSummary.added}</div>
              <div><b>Total now:</b> {lastSummary.total}</div>
            </div>
          </div>
        )}
      </div>

      {/* Upload modal */}
      {open && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[8vh] pb-[8vh]" onClick={backdropClick}>
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Upload Leads</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={()=>setOpen(false)}>Close</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Drop CSV, XLSX, JSON, PDF, DOCX, or TXT. Drag bubbles to map columns.</p>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:bg-slate-700">
                  <input type="file" className="hidden" onChange={handlePick} />
                  {busy ? "Processing…" : "Choose file"}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <div
                      className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
                      onClick={() => setUploadCampaignDropdownOpen(!uploadCampaignDropdownOpen)}
                    >
                      {campaignName ? (
                        <span className="text-slate-900 dark:text-slate-100">{campaignName}</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Select or create campaign...</span>
                      )}
                      <span className="text-slate-400 dark:text-slate-500">▼</span>
                    </div>
                    {uploadCampaignDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-[#1a2332] z-50 shadow-lg">
                        {/* Create new campaign input */}
                        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newCampaignInput}
                              onChange={(e) => setNewCampaignInput(e.target.value)}
                              placeholder="Create new campaign..."
                              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (newCampaignInput.trim()) {
                                  const campName = newCampaignInput.trim();
                                  // Save to database
                                  try {
                                    await fetch('/api/campaigns', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ name: campName })
                                    });
                                    await fetchCampaigns(); // Refresh campaigns list
                                  } catch (err) {
                                    console.error('Error creating campaign:', err);
                                  }
                                  setCampaignName(campName);
                                  setNewCampaignInput('');
                                  setUploadCampaignDropdownOpen(false);
                                }
                              }}
                              className="px-2 py-1 rounded-md bg-sky-500 text-white text-xs hover:bg-sky-600"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                        {/* No campaign option */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setCampaignName('');
                            setUploadCampaignDropdownOpen(false);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:bg-slate-800 ${!campaignName ? 'bg-sky-500/10 text-sky-600' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          No Campaign
                        </div>
                        {/* Saved campaigns list */}
                        {campaigns.length > 0 && (
                          <>
                            <div className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 uppercase border-t border-slate-200 dark:border-slate-700">Saved Campaigns</div>
                            {campaigns.map((camp) => (
                              <div
                                key={camp.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCampaignName(camp.name);
                                  setUploadCampaignDropdownOpen(false);
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:bg-slate-800 flex items-center justify-between ${campaignName === camp.name ? 'bg-sky-500/10 text-sky-600' : ''}`}
                              >
                                <span>{camp.name}</span>
                                {campaignName === camp.name && <span className="text-sky-600">✓</span>}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative flex-1">
                    <div
                      className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm cursor-pointer flex flex-wrap gap-1 items-center"
                      onClick={() => setUploadTagsDropdownOpen(!uploadTagsDropdownOpen)}
                    >
                      {bulkTags && bulkTags.split(',').filter((t: string) => t.trim()).length > 0 ? (
                        bulkTags.split(',').filter((t: string) => t.trim()).map((tag: string, idx: number) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-600 text-xs">
                            {tag.trim()}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentTags = bulkTags.split(',').map((t: string) => t.trim()).filter(Boolean);
                                const newTags = currentTags.filter((t: string) => t !== tag.trim());
                                setBulkTags(newTags.join(', '));
                              }}
                              className="hover:text-gray-900"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Select or create tags...</span>
                      )}
                      <span className="ml-auto text-slate-400 dark:text-slate-500">▼</span>
                    </div>
                    {uploadTagsDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-[#1a2332] z-50 shadow-lg min-w-[320px]">
                        {/* Create new tag input */}
                        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex gap-2 items-center mb-2">
                            <input
                              type="text"
                              value={newTagInput}
                              onChange={(e) => setNewTagInput(e.target.value)}
                              placeholder="Create new tag..."
                              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white px-2 py-1.5 text-sm outline-none focus:border-sky-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (newTagInput.trim()) {
                                  const tagName = newTagInput.trim();
                                  try {
                                    await fetch('/api/tags', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ name: tagName, color: newTagColor })
                                    });
                                    await fetchTags();
                                  } catch (err) {
                                    console.error('Error creating tag:', err);
                                  }
                                  const currentTags = bulkTags ? bulkTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
                                  if (!currentTags.includes(tagName)) {
                                    setBulkTags([...currentTags, tagName].join(', '));
                                  }
                                  setNewTagInput('');
                                  setNewTagColor('#f59e0b');
                                  setUploadTagsDropdownOpen(false);
                                }
                              }}
                              className="px-3 py-1.5 rounded-md bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 whitespace-nowrap"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-900/50">Color:</span>
                            <div className="flex gap-1.5">
                              {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setNewTagColor(color); }}
                                  className={`w-5 h-5 rounded-full ${newTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1a2332]' : ''}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Saved tags list */}
                        {tagsList.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No saved tags yet</div>
                        ) : (
                          <>
                            <div className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 uppercase">Saved Tags</div>
                            {tagsList.map((t) => {
                              const currentTags = bulkTags ? bulkTags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];
                              const isSelected = currentTags.includes(t.name);
                              return (
                                <div
                                  key={t.name}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSelected) {
                                      const newTags = currentTags.filter((tag: string) => tag !== t.name);
                                      setBulkTags(newTags.join(', '));
                                    } else {
                                      const newTags = [...currentTags, t.name];
                                      setBulkTags(newTags.join(', '));
                                    }
                                  }}
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:bg-slate-800 flex items-center justify-between ${isSelected ? 'bg-sky-500/10 text-sky-600' : ''}`}
                                >
                                  <span className="flex items-center gap-2">
                                    {t.color && (
                                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                    )}
                                    {t.name}
                                  </span>
                                  {isSelected && <span className="text-sky-600">✓</span>}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {raw?.ok && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                  <div className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                    Detected: <b className="text-slate-900 dark:text-slate-100">{(raw.detectedType||"").toUpperCase()}</b> • Parsed rows: <b className="text-slate-900 dark:text-slate-100">{raw.total}</b>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-widest text-slate-600 dark:text-slate-400">Detected columns</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(raw.preview?.[0] || {}).map(col=>(
                          <div
                            key={col}
                            draggable
                            onDragStart={(e)=>{ e.dataTransfer.setData("text/plain", col); }}
                            className="cursor-grab rounded-full border border-slate-200 dark:border-slate-700 bg-white px-3 py-1 text-xs"
                          >
                            {col}
                          </div>
                        ))}
                        {!Object.keys(raw.preview?.[0] || {}).length && <div className="text-xs text-slate-600 dark:text-slate-400">—</div>}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs uppercase tracking-widest text-slate-600 dark:text-slate-400">Map to fields</div>
                      <div className="grid grid-cols-2 gap-2">
                        {CANON_FIELDS.map((field)=>(
                          <div key={field}
                               onDrop={(e)=>{ e.preventDefault(); const col=e.dataTransfer.getData("text/plain"); if(col) assignMapping(field,col); }}
                               onDragOver={(e)=>e.preventDefault()}
                               className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-white p-2">
                            <div className="mb-1 text-[11px] uppercase tracking-widest text-slate-600 dark:text-slate-400">{field}</div>
                            {mapping[field] ? (
                              <div className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                                <span>{mapping[field]}</span>
                                <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={()=>clearMapping(field)} type="button">×</button>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 dark:text-slate-400">Drop column here</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {raw?.ok && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm">
                  <div className="max-h-[40vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[#101a29]">
                          {CANON_FIELDS.map(h=>(
                            <th key={h} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mappedPreview.map((r, i)=>(
                          <tr key={i} className="odd:bg-white even:bg-slate-50 dark:bg-slate-800">
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.first_name||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.last_name||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.phone||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.email||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.state||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.zip_code||""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{Array.isArray(r.tags)? r.tags.join(", "):""}</td>
                            <td className="border-b border-slate-200 dark:border-slate-700 px-3 py-2">{r.status||""}</td>
                          </tr>
                        ))}
                        {!mappedPreview.length && (
                          <tr><td colSpan={8} className="px-3 py-4 text-slate-600 dark:text-slate-400">No rows detected.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end">
              {canImport && (
                <button
                  onClick={onImport}
                  data-testid="confirm-import"
                  className="rounded-md border border-[#2a6cff] bg-[#2a6cff]/20 px-4 py-2 text-sm hover:bg-[#2a6cff]/30"
                  type="button"
                >
                  Confirm Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Run Campaign modal — campaign must be chosen from saved list */}
      {runOpen && (() => {
        const presetColors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
        return (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[8vh] pb-[8vh]" onClick={backdropClick}>
          <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Run Campaign</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={()=>{ setRunOpen(false); setRunTagsDropdownOpen(false); }}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div className="grid gap-3">
                <select
                  value={runCampaignId}
                  onChange={(e)=>setRunCampaignId(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                >
                  <option value="">{campaigns.length ? "Select a saved campaign…" : "No saved campaigns"}</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {/* Tags dropdown with saved tags and create new */}
                <div className="relative">
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Tags to apply (optional)</label>

                  {/* Selected tags display */}
                  {runTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {runTags.map(tag => {
                        const tagInfo = tagsList.find(t => t.name === tag);
                        return (
                          <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-sky-500/20 text-sky-300 border border-sky-200 flex items-center gap-1.5">
                            {tagInfo?.color && (
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                            )}
                            {tag}
                            <button
                              type="button"
                              onClick={() => setRunTags(runTags.filter(t => t !== tag))}
                              className="hover:text-gray-900"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setRunTagsDropdownOpen(!runTagsDropdownOpen)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                  >
                    <span className="text-slate-600 dark:text-slate-400">{runTags.length > 0 ? `${runTags.length} tag(s) selected` : 'Select or create tags...'}</span>
                    <span className="text-slate-600 dark:text-slate-400">{runTagsDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {runTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-lg z-50 max-h-[200px] overflow-y-auto">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={runNewTagInput}
                            onChange={(e) => setRunNewTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-[#1a2332] px-2 py-1 text-xs outline-none"
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && runNewTagInput.trim()) {
                                const tagName = runNewTagInput.trim();
                                try {
                                  await fetch('/api/tags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: tagName, color: runNewTagColor })
                                  });
                                  const res = await fetch('/api/tags');
                                  const data = await res.json();
                                  if (data.ok) setTagsList(data.items || []);
                                } catch (err) {
                                  console.error('Error saving tag:', err);
                                }
                                if (!runTags.includes(tagName)) {
                                  setRunTags([...runTags, tagName]);
                                }
                                setRunNewTagInput('');
                                setRunTagsDropdownOpen(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (runNewTagInput.trim()) {
                                const tagName = runNewTagInput.trim();
                                try {
                                  await fetch('/api/tags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: tagName, color: runNewTagColor })
                                  });
                                  const res = await fetch('/api/tags');
                                  const data = await res.json();
                                  if (data.ok) setTagsList(data.items || []);
                                } catch (err) {
                                  console.error('Error saving tag:', err);
                                }
                                if (!runTags.includes(tagName)) {
                                  setRunTags([...runTags, tagName]);
                                }
                                setRunNewTagInput('');
                                setRunTagsDropdownOpen(false);
                              }
                            }}
                            className="px-2 py-1 rounded bg-sky-500/20 text-sky-600 text-xs hover:bg-sky-500/30"
                          >
                            Add
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Color:</span>
                          <div className="flex gap-1">
                            {presetColors.map(color => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setRunNewTagColor(color)}
                                className={`w-5 h-5 rounded-full ${runNewTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1a2332]' : ''}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Saved tags */}
                      {tagsList.length === 0 ? (
                        <div className="p-2 text-xs text-slate-600 dark:text-slate-400">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 bg-[#18273a]">Saved Tags</div>
                          {tagsList.map(t => {
                            const isSelected = runTags.includes(t.name);
                            return (
                              <div
                                key={t.name}
                                onClick={() => {
                                  if (isSelected) {
                                    setRunTags(runTags.filter(tag => tag !== t.name));
                                  } else {
                                    setRunTags([...runTags, t.name]);
                                  }
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 justify-between ${isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </div>
                                {isSelected && <span className="text-sky-600">✓</span>}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Filters row */}
                <div className="grid grid-cols-2 gap-2">
                  {/* State filter dropdown */}
                  <div className="relative">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Filter by State</label>
                    <button
                      type="button"
                      onClick={() => setRunStatesDropdownOpen(!runStatesDropdownOpen)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span className="text-slate-600 dark:text-slate-400 truncate">
                        {runStates.length > 0 ? runStates.join(', ') : 'All states'}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">{runStatesDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    {runStatesDropdownOpen && (() => {
                      // Get unique states from leads
                      const uniqueStates = [...new Set(leads.map(l => l.state).filter(Boolean))].sort();
                      return (
                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-lg z-50 max-h-[200px] overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setRunStates([]); setRunStatesDropdownOpen(false); }}
                            className={`w-full px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${runStates.length === 0 ? 'bg-sky-500/10 text-sky-600' : ''}`}
                          >
                            All states
                          </button>
                          {uniqueStates.map(state => {
                            const isSelected = runStates.includes(state as string);
                            const count = leads.filter(l => l.state === state).length;
                            return (
                              <button
                                key={state}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setRunStates(runStates.filter(s => s !== state));
                                  } else {
                                    setRunStates([...runStates, state as string]);
                                  }
                                }}
                                className={`w-full px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between ${isSelected ? 'bg-sky-500/10' : ''}`}
                              >
                                <span>{state}</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-slate-600 dark:text-slate-400">({count})</span>
                                  {isSelected && <span className="text-sky-600">✓</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* ZIP codes filter */}
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Filter by ZIP</label>
                    <input
                      value={runZipCodes}
                      onChange={(e)=>setRunZipCodes(e.target.value)}
                      placeholder="ZIP codes (comma-separated)"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={runScope==="selected"} onChange={()=>setRunScope("selected")} />
                    <span>Selected leads ({selectedIds.size})</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={runScope==="filtered"} onChange={()=>setRunScope("filtered")} />
                    <span>All filtered ({filtered.length})</span>
                  </label>
                </div>

                {/* Preview leads that will be included */}
                {(() => {
                  let previewLeads = runScope === "selected"
                    ? leads.filter(l => selectedIds.has(String(l.id ?? "")))
                    : filtered;

                  // Apply state filter
                  if (runStates.length > 0) {
                    previewLeads = previewLeads.filter(l => l.state && runStates.includes(l.state));
                  }

                  // Apply ZIP filter
                  if (runZipCodes.trim()) {
                    const zips = runZipCodes.split(',').map(z => z.trim()).filter(Boolean);
                    previewLeads = previewLeads.filter(l => l.zip_code && zips.includes(l.zip_code));
                  }

                  const displayLeads = previewLeads.slice(0, 10);
                  const remainingCount = previewLeads.length - displayLeads.length;

                  return (
                    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="bg-[#18273a] px-3 py-2 text-xs text-slate-600 dark:text-slate-400 flex justify-between">
                        <span>Leads to include ({previewLeads.length})</span>
                        {previewLeads.length === 0 && <span className="text-amber-400">No leads selected</span>}
                      </div>
                      {previewLeads.length > 0 && (
                        <div className="max-h-[200px] overflow-y-auto">
                          {displayLeads.map(l => (
                            <div key={l.id} className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 last:border-b-0 flex items-center justify-between text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium">
                                  {(l.first_name?.[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium">{l.first_name} {l.last_name}</div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400">{l.phone || l.email || 'No contact'}</div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-400">{l.state || ''}</div>
                            </div>
                          ))}
                          {remainingCount > 0 && (
                            <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 text-center bg-slate-50 dark:bg-slate-800">
                              + {remainingCount} more lead{remainingCount !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end">
              <button
                onClick={runCampaign}
                disabled={running || !runCampaignId}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-600 hover:bg-sky-100 disabled:opacity-50"
                type="button"
              >
                {running ? "Running…" : "Run Campaign"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Bulk Action Modals */}
      {bulkActionModal === 'status' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[400px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Update Status</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
              >
                <option value="">Select status...</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="sold">Sold</option>
              </select>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdate({ status: bulkStatus })}
                disabled={!bulkStatus}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-600 hover:bg-sky-100 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'disposition' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Update Outcome</div>
              <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => setBulkDisposition('sold')}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition ${
                  bulkDisposition === 'sold'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                ✓ Sold
              </button>
              <button
                onClick={() => setBulkDisposition('not_interested')}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition ${
                  bulkDisposition === 'not_interested'
                    ? 'bg-red-500/20 text-red-600 dark:text-red-400 ring-1 ring-red-500'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                ✗ Not Interested
              </button>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdate({ disposition: bulkDisposition })}
                disabled={!bulkDisposition}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'addTags' && (() => {
        // Get current tags from selected leads
        const selectedLeadsList = leads.filter(l => selectedIds.has(String(l.id)));
        const currentTagsOnLeads = new Set<string>();
        selectedLeadsList.forEach(l => {
          if (Array.isArray(l.tags)) l.tags.forEach(t => currentTagsOnLeads.add(t));
        });
        return (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[10vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[600px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Add Tags</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* Current tags on selected leads */}
              {currentTagsOnLeads.size > 0 && (
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Current tags on selected leads:</p>
                  <div className="flex flex-wrap gap-1">
                    {[...currentTagsOnLeads].map(tag => {
                      const tagInfo = tagsList.find(t => t.name === tag);
                      return (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-800 text-xs">
                          {tagInfo?.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />}
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tags to add */}
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">Tags to add:</p>
                <div className="relative">
                  <div
                    className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 cursor-pointer flex flex-wrap gap-1 items-center"
                    onClick={() => setBulkAddTagsDropdownOpen(!bulkAddTagsDropdownOpen)}
                  >
                    {bulkAddTags && bulkAddTags.split(',').filter(t => t.trim()).length > 0 ? (
                      bulkAddTags.split(',').filter(t => t.trim()).map((tag, idx) => {
                        const tagInfo = tagsList.find(t => t.name === tag.trim());
                        return (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-600 text-xs">
                            {tagInfo?.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />}
                            {tag.trim()}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentTags = bulkAddTags.split(',').map(t => t.trim()).filter(Boolean);
                                setBulkAddTags(currentTags.filter(t => t !== tag.trim()).join(', '));
                              }}
                              className="hover:text-gray-900"
                            >×</button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">Select or create tags...</span>
                    )}
                    <span className="ml-auto text-slate-400 dark:text-slate-500">▼</span>
                  </div>
                  {bulkAddTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-[#1a2332] z-50 shadow-lg">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex gap-2 items-center mb-2">
                          <input
                            type="text"
                            value={bulkNewTagInput}
                            onChange={(e) => setBulkNewTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white px-2 py-1.5 text-sm outline-none focus:border-sky-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (bulkNewTagInput.trim()) {
                                const tagName = bulkNewTagInput.trim();
                                try {
                                  await fetch('/api/tags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: tagName, color: bulkNewTagColor })
                                  });
                                  await fetchTags();
                                } catch (err) { console.error('Error creating tag:', err); }
                                const currentTags = bulkAddTags ? bulkAddTags.split(',').map(t => t.trim()).filter(Boolean) : [];
                                if (!currentTags.includes(tagName)) {
                                  setBulkAddTags([...currentTags, tagName].join(', '));
                                }
                                setBulkNewTagInput('');
                                setBulkNewTagColor('#f59e0b');
                                setBulkAddTagsDropdownOpen(false);
                              }
                            }}
                            className="px-3 py-1.5 rounded-md bg-sky-500 text-white text-xs font-medium hover:bg-sky-600"
                          >Add</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-900/50">Color:</span>
                          <div className="flex gap-1.5">
                            {['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'].map(color => (
                              <button
                                key={color}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setBulkNewTagColor(color); }}
                                className={`w-5 h-5 rounded-full ${bulkNewTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1a2332]' : ''}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Saved tags */}
                      {tagsList.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 uppercase">Saved Tags</div>
                          {tagsList.map(t => {
                            const currentTags = bulkAddTags ? bulkAddTags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
                            const isSelected = currentTags.includes(t.name);
                            return (
                              <div
                                key={t.name}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isSelected) {
                                    setBulkAddTags(currentTags.filter(tag => tag !== t.name).join(', '));
                                  } else {
                                    setBulkAddTags([...currentTags, t.name].join(', '));
                                  }
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:bg-slate-800 flex items-center justify-between ${isSelected ? 'bg-sky-500/10 text-sky-600' : ''}`}
                              >
                                <span className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </span>
                                {isSelected && <span className="text-sky-600">✓</span>}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Clear all tags option */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => bulkUpdate({ clearTags: true })}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove all tags from selected leads
                </button>
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setBulkActionModal(null); setBulkAddTagsDropdownOpen(false); }}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => { bulkUpdate({ addTags: bulkAddTags.split(',').map(t => t.trim()).filter(Boolean) }); setBulkAddTagsDropdownOpen(false); }}
                disabled={!bulkAddTags.trim()}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-600 hover:bg-sky-100 disabled:opacity-50"
              >
                Add Tags
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {bulkActionModal === 'removeTags' && (() => {
        // Get all unique tags from selected leads
        const selectedLeadsList = leads.filter(l => l.id && selectedIds.has(String(l.id)));
        const currentTagsOnSelected = [...new Set(selectedLeadsList.flatMap(l => Array.isArray(l.tags) ? l.tags : []))];
        const tagsToRemove = bulkRemoveTags.split(',').map(t => t.trim()).filter(Boolean);
        const presetColors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

        return (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => { setBulkActionModal(null); setBulkRemoveTagsDropdownOpen(false); }}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[600px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Manage Tags</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => { setBulkActionModal(null); setBulkRemoveTagsDropdownOpen(false); }}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* Current tags on selected leads */}
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2">Current tags on selected leads (click to remove):</label>
                {currentTagsOnSelected.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {currentTagsOnSelected.map(tag => {
                      const tagInfo = tagsList.find(t => t.name === tag);
                      const isSelected = tagsToRemove.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setBulkRemoveTags(tagsToRemove.filter(t => t !== tag).join(', '));
                            } else {
                              setBulkRemoveTags([...tagsToRemove, tag].join(', '));
                            }
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 transition-all ${
                            isSelected
                              ? 'bg-red-500/30 border border-red-500/50 text-red-300 line-through'
                              : 'bg-[#18273a] border border-slate-200 dark:border-slate-700 hover:border-red-500/50 hover:bg-red-500/10'
                          }`}
                        >
                          {tagInfo?.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                          )}
                          {tag}
                          {isSelected && <span className="ml-1">✕</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">No tags on selected leads</p>
                )}
              </div>

              {/* Replace with new tags section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2">Replace with tags (optional):</label>

                {/* Selected replacement tags */}
                {bulkReplaceTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {bulkReplaceTags.map(tag => {
                      const tagInfo = tagsList.find(t => t.name === tag);
                      return (
                        <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-sky-500/20 text-sky-300 border border-sky-200 flex items-center gap-1.5">
                          {tagInfo?.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                          )}
                          {tag}
                          <button
                            type="button"
                            onClick={() => setBulkReplaceTags(bulkReplaceTags.filter(t => t !== tag))}
                            className="hover:text-gray-900"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Dropdown for selecting/creating tags */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBulkRemoveTagsDropdownOpen(!bulkRemoveTagsDropdownOpen)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                  >
                    <span className="text-slate-600 dark:text-slate-400">Select or create tags...</span>
                    <span className="text-slate-600 dark:text-slate-400">{bulkRemoveTagsDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {bulkRemoveTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-lg z-50 max-h-[200px] overflow-y-auto min-w-[320px]">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={bulkReplaceTagInput}
                            onChange={(e) => setBulkReplaceTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-[#1a2332] px-2 py-1 text-xs outline-none"
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && bulkReplaceTagInput.trim()) {
                                const tagName = bulkReplaceTagInput.trim();
                                // Save to database
                                try {
                                  await fetch('/api/tags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: tagName, color: bulkReplaceTagColor })
                                  });
                                  // Refresh tags list
                                  const res = await fetch('/api/tags');
                                  const data = await res.json();
                                  if (data.ok) setTagsList(data.items || []);
                                } catch (err) {
                                  console.error('Error saving tag:', err);
                                }
                                if (!bulkReplaceTags.includes(tagName)) {
                                  setBulkReplaceTags([...bulkReplaceTags, tagName]);
                                }
                                setBulkReplaceTagInput('');
                                setBulkRemoveTagsDropdownOpen(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (bulkReplaceTagInput.trim()) {
                                const tagName = bulkReplaceTagInput.trim();
                                try {
                                  await fetch('/api/tags', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: tagName, color: bulkReplaceTagColor })
                                  });
                                  const res = await fetch('/api/tags');
                                  const data = await res.json();
                                  if (data.ok) setTagsList(data.items || []);
                                } catch (err) {
                                  console.error('Error saving tag:', err);
                                }
                                if (!bulkReplaceTags.includes(tagName)) {
                                  setBulkReplaceTags([...bulkReplaceTags, tagName]);
                                }
                                setBulkReplaceTagInput('');
                                setBulkRemoveTagsDropdownOpen(false);
                              }
                            }}
                            className="px-2 py-1 rounded bg-sky-500/20 text-sky-600 text-xs hover:bg-sky-500/30"
                          >
                            Add
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Color:</span>
                          <div className="flex gap-1">
                            {presetColors.map(color => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setBulkReplaceTagColor(color)}
                                className={`w-5 h-5 rounded-full ${bulkReplaceTagColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1a2332]' : ''}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Saved tags */}
                      {tagsList.length === 0 ? (
                        <div className="p-2 text-xs text-slate-600 dark:text-slate-400">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 bg-[#18273a]">Saved Tags</div>
                          {tagsList.map(t => {
                            const isSelected = bulkReplaceTags.includes(t.name);
                            return (
                              <div
                                key={t.name}
                                onClick={() => {
                                  if (isSelected) {
                                    setBulkReplaceTags(bulkReplaceTags.filter(tag => tag !== t.name));
                                  } else {
                                    setBulkReplaceTags([...bulkReplaceTags, t.name]);
                                  }
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 justify-between ${isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </div>
                                {isSelected && <span className="text-sky-600">✓</span>}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="p-3 bg-[#18273a] rounded-lg text-xs">
                {tagsToRemove.length > 0 && (
                  <p className="text-red-300 mb-1">
                    Removing: {tagsToRemove.join(', ')}
                  </p>
                )}
                {bulkReplaceTags.length > 0 && (
                  <p className="text-sky-300">
                    Adding: {bulkReplaceTags.join(', ')}
                  </p>
                )}
                {tagsToRemove.length === 0 && bulkReplaceTags.length === 0 && (
                  <p className="text-slate-600 dark:text-slate-400">Select tags to remove or add replacement tags</p>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => { bulkUpdate({ clearTags: true }); setBulkRemoveTagsDropdownOpen(false); }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove ALL tags
                </button>
                <span className="text-slate-600 dark:text-slate-400">|</span>
                <button
                  type="button"
                  onClick={() => { setBulkRemoveTags(''); setBulkReplaceTags([]); }}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-gray-900"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setBulkActionModal(null); setBulkRemoveTagsDropdownOpen(false); setBulkReplaceTags([]); }}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  bulkUpdate({
                    removeTags: tagsToRemove.length > 0 ? tagsToRemove : undefined,
                    addTags: bulkReplaceTags.length > 0 ? bulkReplaceTags : undefined
                  });
                  setBulkRemoveTagsDropdownOpen(false);
                  setBulkReplaceTags([]);
                }}
                disabled={tagsToRemove.length === 0 && bulkReplaceTags.length === 0}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-600 hover:bg-sky-100 disabled:opacity-50"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {bulkActionModal === 'createFollowUps' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[500px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-slate-600 dark:text-slate-400">Create Follow-ups</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Title *</label>
                <input
                  value={bulkFollowUpTitle}
                  onChange={(e) => setBulkFollowUpTitle(e.target.value)}
                  placeholder="Follow up with {name}"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Use {`{name}`} to insert lead first name</p>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Notes</label>
                <textarea
                  value={bulkFollowUpNotes}
                  onChange={(e) => setBulkFollowUpNotes(e.target.value)}
                  placeholder="Additional notes about this follow-up..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Due Date & Time *</label>
                <input
                  type="datetime-local"
                  value={bulkFollowUpDueDate}
                  onChange={(e) => setBulkFollowUpDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Priority</label>
                <select
                  value={bulkFollowUpPriority}
                  onChange={(e) => setBulkFollowUpPriority(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Creating {selectedIds.size} follow-up(s) for selected leads
              </p>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={bulkCreateFollowUps}
                disabled={!bulkFollowUpTitle.trim() || !bulkFollowUpDueDate}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-600 hover:bg-sky-100 disabled:opacity-50"
              >
                Create Follow-ups
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'reDrip' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[500px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-purple-500 dark:text-purple-400">🔄 Re-Drip to Campaign</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Select Campaign *</label>
                <select
                  value={reDripCampaignId}
                  onChange={(e) => setReDripCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                >
                  <option value="">Choose a campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Re-enroll selected leads in this drip campaign
                </p>
              </div>
              <div className="p-3 bg-sky-500/10 border border-sky-200 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reDripResetProgress}
                    onChange={(e) => setReDripResetProgress(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-sky-300">
                    Reset progress and start from beginning
                  </span>
                </label>
                <p className="text-xs text-sky-300/60 mt-1 ml-6">
                  Leads will restart the campaign from step 1, even if they've completed it before
                </p>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Re-enrolling {selectedIds.size} lead(s) into the campaign
              </p>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reDripCampaignId) {
                    setToast('Please select a campaign');
                    return;
                  }
                  try {
                    const response = await fetch('/api/drip-campaigns/re-enroll', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        campaignId: reDripCampaignId,
                        leadIds: Array.from(selectedIds),
                        resetProgress: reDripResetProgress,
                      }),
                    });
                    const data = await response.json();
                    if (data.ok) {
                      setToast(data.message || 'Leads re-enrolled successfully');
                      setBulkActionModal(null);
                      setSelectedIds(new Set());
                      setReDripCampaignId('');
                    } else {
                      setToast(data.error || 'Failed to re-enroll leads');
                    }
                  } catch (error) {
                    setToast('Error re-enrolling leads');
                  }
                }}
                disabled={!reDripCampaignId}
                className="rounded-md border border-sky-200 bg-sky-500/20 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
              >
                Re-Enroll Leads
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'scheduleMessage' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[10vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[600px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-amber-500">📅 Schedule Bulk Message</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div className="p-3 bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-amber-600 dark:text-amber-400 font-medium">
                  Scheduling message for {selectedIds.size} lead(s)
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                  Each lead will receive this message at the scheduled time
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Message *</label>
                <textarea
                  value={bulkScheduleMessage}
                  onChange={(e) => setBulkScheduleMessage(e.target.value)}
                  placeholder="Type your message here... Use {{first}}, {{last}}, or {{name}} for personalization"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none resize-none"
                  rows={4}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {bulkScheduleMessage.length} characters • ~{Math.ceil(bulkScheduleMessage.length / 160)} SMS segment(s)
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Schedule Date & Time *</label>
                <input
                  type="datetime-local"
                  value={bulkScheduleDate}
                  onChange={(e) => setBulkScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <strong>Cost:</strong> ~{selectedIds.size * Math.max(1, Math.ceil(bulkScheduleMessage.length / 160)) * 2} credits
                  ({Math.max(1, Math.ceil(bulkScheduleMessage.length / 160)) * 2} credits per message × {selectedIds.size} leads)
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setBulkActionModal(null); setBulkScheduleMessage(''); setBulkScheduleDate(''); }}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!bulkScheduleMessage.trim()) {
                    setToast('Please enter a message');
                    return;
                  }
                  if (!bulkScheduleDate) {
                    setToast('Please select a date and time');
                    return;
                  }
                  setSchedulingBulk(true);
                  try {
                    const response = await fetch('/api/messages/schedule/bulk', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        leadIds: Array.from(selectedIds),
                        body: bulkScheduleMessage,
                        scheduledFor: new Date(bulkScheduleDate).toISOString(),
                        channel: 'sms',
                      }),
                    });
                    const data = await response.json();
                    if (data.ok) {
                      setToast(`${data.scheduled} messages scheduled successfully`);
                      setBulkActionModal(null);
                      setSelectedIds(new Set());
                      setBulkScheduleMessage('');
                      setBulkScheduleDate('');
                    } else {
                      setToast(data.error || 'Failed to schedule messages');
                    }
                  } catch (error) {
                    setToast('Error scheduling messages');
                  } finally {
                    setSchedulingBulk(false);
                  }
                }}
                disabled={!bulkScheduleMessage.trim() || !bulkScheduleDate || schedulingBulk}
                className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-500/20 px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {schedulingBulk ? 'Scheduling...' : `Schedule ${selectedIds.size} Message(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'delete' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[300px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-red-500">Delete Leads</div>
              <button className="text-slate-600 dark:text-slate-400 hover:text-gray-900" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <p className="text-slate-900 dark:text-slate-100">
                Are you sure you want to delete {selectedIds.size} selected lead(s)?
              </p>
              <p className="text-red-500">
                This action cannot be undone. All associated data (threads, messages, follow-ups) will also be deleted.
              </p>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={bulkDeleteLeads}
                className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-500 hover:bg-red-100 dark:bg-red-900/40"
              >
                Delete {selectedIds.size} Lead(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details Modal */}
      {selectedLeadDetails && (() => {
        const selectedLead = leads.find(l => String(l.id) === selectedLeadDetails);
        const leadName = selectedLead ? [selectedLead.first_name, selectedLead.last_name].filter(Boolean).join(' ') || 'Unknown' : 'Unknown';
        return (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[8vh] pb-[8vh]" onClick={() => setSelectedLeadDetails(null)}>
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-600 font-semibold">
                  {leadName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">{leadName}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{selectedLead?.phone || 'No phone'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { openEditLead(selectedLead); setSelectedLeadDetails(null); }}
                  className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm hover:bg-[#243447] transition border border-[#2a3a4d]"
                >
                  Edit Lead
                </button>
                {selectedLead?.phone && (
                  <button
                    onClick={() => router.push(`/texts?phone=${encodeURIComponent(selectedLead.phone!)}&name=${encodeURIComponent(leadName)}`)}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-slate-900 dark:text-slate-100 text-sm hover:bg-blue-700 transition"
                  >
                    Send Message
                  </button>
                )}
                <button className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 text-xl px-2" onClick={() => setSelectedLeadDetails(null)}>×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetails ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">Loading details...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left Column - Lead Info & Activity */}
                  <div className="space-y-4">
                    {/* Contact Information */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-1">Name</div>
                          <div className="text-slate-900 dark:text-slate-100">{leadName}</div>
                        </div>
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-1">Phone</div>
                          <div className="text-slate-900 dark:text-slate-100">{selectedLead?.phone || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-1">Email</div>
                          <div className="text-slate-900 dark:text-slate-100 break-all">{selectedLead?.email || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-1">State</div>
                          <div className="text-slate-900 dark:text-slate-100">{selectedLead?.state || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-1">Campaign</div>
                          <div className="text-slate-900 dark:text-slate-100">{campaigns.find(c => c.id === (selectedLead as any)?.campaign_id)?.name || '—'}</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="text-slate-600 dark:text-slate-400 text-xs uppercase mb-2">Pipeline Tags <span className="normal-case font-normal">(click to set primary)</span></div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLead?.tags && selectedLead.tags.length > 0 ? (
                            selectedLead.tags.map((tag: string, i: number) => {
                              const tagInfo = tagsList.find(t => t.name === tag);
                              return (
                                <button
                                  key={i}
                                  onClick={async () => {
                                    const newPrimary = selectedLead.primary_tag === tag ? null : tag;
                                    try {
                                      await fetch(`/api/leads/${selectedLead.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ primary_tag: newPrimary }),
                                      });
                                      setLeads(prev => prev.map(l => String(l.id) === String(selectedLead.id) ? { ...l, primary_tag: newPrimary } : l));
                                      fetchLeads();
                                    } catch {}
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                    selectedLead.primary_tag === tag
                                      ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-400'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                  }`}
                                  title={selectedLead.primary_tag === tag ? 'Primary tag (click to unset)' : 'Click to set as primary'}
                                >
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo?.color || '#94a3b8' }} />
                                  {selectedLead.primary_tag === tag && '★ '}{tag}
                                </button>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">No tags assigned</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Activity Timeline */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Activity Timeline
                      </h3>
                      {leadActivities.length === 0 ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">No activities recorded yet</p>
                      ) : (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {leadActivities.map((activity) => (
                            <div key={activity.id} className="border-l-2 border-sky-500 pl-3 py-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
                                    {activity.activity_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                    {activity.description}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-400 ml-3">
                                  {new Date(activity.created_at).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Messages */}
                  <div className="space-y-4">
                    {/* SMS Messages */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 h-full">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Messages ({leadMessages.length})
                      </h3>
                      {leadMessages.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">No messages yet</p>
                          {selectedLead?.phone && (
                            <button
                              onClick={() => router.push(`/texts?phone=${encodeURIComponent(selectedLead.phone!)}&name=${encodeURIComponent(leadName)}`)}
                              className="px-4 py-2 rounded-md bg-blue-600 text-slate-900 dark:text-slate-100 text-sm hover:bg-blue-700 transition"
                            >
                              Start Conversation
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {leadMessages.map((msg, i) => {
                            const isOutbound = msg.direction === 'outbound' || msg.direction === 'out' || msg.sender === 'agent';
                            return (
                              <div key={msg.id || i} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                  isOutbound
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                }`}>
                                  <div className="text-[10px] font-semibold mb-0.5 opacity-80">
                                    {isOutbound ? 'You' : (selectedLead?.first_name || 'Lead')}
                                  </div>
                                  <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                                  <div className={`text-[10px] mt-1 ${
                                    isOutbound ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                                  }`}>
                                    {new Date(msg.created_at).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Bulk Compose Drawer */}
      <BulkComposeDrawer
        isOpen={composeDrawerOpen}
        onClose={() => setComposeDrawerOpen(false)}
        preSelectedLeadIds={selectedIds.size > 0 ? Array.from(selectedIds) : []}
      />
    </div>
  );
}

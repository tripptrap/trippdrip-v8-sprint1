"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTemperatureDisplay } from "@/lib/leadScoring";
import CustomModal from "@/components/CustomModal";

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
    status: "new"
  });
  const [addingLead, setAddingLead] = useState(false);

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

  async function fetchLeads() {
    setLoading(true);
    try {
      // Check if demo mode is active
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        // Use demo data
        const { getDemoLeads } = await import('@/lib/demoData');
        const demoLeads = getDemoLeads();
        setLeads(demoLeads);
      } else {
        // Fetch real data
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (selectedTags.length) params.set("tags", selectedTags.join(","));
        const res = await fetch(`/api/leads?${params.toString()}`);
        const data = await res.json();
        setLeads(Array.isArray(data?.items) ? data.items : []);
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
        tags: newLead.tags ? newLead.tags.split(',').map(t => t.trim()).filter(Boolean) : []
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
        setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new" });
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
            setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new" });
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
        setToast(`Lead disposition updated to: ${disposition}`);
        setTimeout(()=>setToast(''), 2500);
        await fetchLeads();
      } else {
        setToast(`Error: ${data.error || 'Failed to update disposition'}`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (e: any) {
      setToast(`Error: ${e?.message || 'Failed to update disposition'}`);
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

      // Fetch messages for this lead (by phone number)
      if (phone) {
        const messagesRes = await fetch(`/api/messages/by-phone?phone=${encodeURIComponent(phone)}`);
        const messagesData = await messagesRes.json();
        if (messagesData.ok) {
          setLeadMessages(messagesData.messages || []);
        }
      }
    } catch (error) {
      console.error('Error fetching lead details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  useEffect(() => { fetchLeads(); fetchCampaigns(); fetchTags(); }, []);
  useEffect(() => { fetchLeads(); }, [q, selectedTags]);

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

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAllVisible() {
    if (allVisibleSelected) {
      const n = new Set(selectedIds);
      for (const l of filtered) n.delete(String(l.id ?? ""));
      setSelectedIds(n);
    } else {
      const n = new Set(selectedIds);
      for (const l of filtered) n.add(String(l.id ?? ""));
      setSelectedIds(n);
    }
  }

  // Select ALL visible leads (respects archive filter)
  const allLeadsSelected = useMemo(() => {
    if (!filtered.length) return false;
    for (const l of filtered) { if (!selectedIds.has(String(l.id ?? ""))) return false; }
    return true;
  }, [filtered, selectedIds]);

  function selectAllLeads() {
    const n = new Set<string>();
    for (const l of filtered) n.add(String(l.id ?? ""));
    setSelectedIds(n);
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleTagChip(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t=>t!==tag) : [...prev, tag]);
  }

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
    <div className="text-[#e7eef9]">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-[#1f3a2a] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] shadow">
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
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f1722] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add New Lead</h3>
              <button onClick={() => { setAddLeadOpen(false); setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new" }); }} className="text-white/60 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newLead.first_name}
                    onChange={(e) => setNewLead({ ...newLead, first_name: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLead.last_name}
                    onChange={(e) => setNewLead({ ...newLead, last_name: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Email</label>
                <input
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">State</label>
                  <input
                    type="text"
                    value={newLead.state}
                    onChange={(e) => setNewLead({ ...newLead, state: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={newLead.zip_code}
                    onChange={(e) => setNewLead({ ...newLead, zip_code: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="90210"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newLead.tags}
                  onChange={(e) => setNewLead({ ...newLead, tags: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="facebook, interested, warm"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Status</label>
                <select
                  value={newLead.status}
                  onChange={(e) => setNewLead({ ...newLead, status: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setAddLeadOpen(false); setNewLead({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", status: "new" }); }}
                className="px-4 py-2 text-sm text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={addingLead}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0f1722] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Lead</h3>
              <button onClick={() => { setEditLeadOpen(false); setEditingLead(null); setEditTagsDropdownOpen(false); }} className="text-white/60 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editingLead.first_name}
                    onChange={(e) => setEditingLead({ ...editingLead, first_name: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editingLead.last_name}
                    onChange={(e) => setEditingLead({ ...editingLead, last_name: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={editingLead.phone}
                  onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Email</label>
                <input
                  type="email"
                  value={editingLead.email}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="john@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">State</label>
                  <input
                    type="text"
                    value={editingLead.state}
                    onChange={(e) => setEditingLead({ ...editingLead, state: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={editingLead.zip_code}
                    onChange={(e) => setEditingLead({ ...editingLead, zip_code: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="90210"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Tags</label>
                <div className="relative">
                  <div
                    className="w-full min-h-[38px] rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm cursor-pointer flex flex-wrap gap-1 items-center"
                    onClick={() => setEditTagsDropdownOpen(!editTagsDropdownOpen)}
                  >
                    {editingLead.tags && editingLead.tags.split(',').filter((t: string) => t.trim()).length > 0 ? (
                      editingLead.tags.split(',').filter((t: string) => t.trim()).map((tag: string, idx: number) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                          {tag.trim()}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentTags = editingLead.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
                              const newTags = currentTags.filter((t: string) => t !== tag.trim());
                              setEditingLead({ ...editingLead, tags: newTags.join(', ') });
                            }}
                            className="hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-white/40">Select tags...</span>
                    )}
                    <span className="ml-auto text-white/40">▼</span>
                  </div>
                  {editTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-[#1a2332] z-50 shadow-lg">
                      {tagsList.length === 0 && allTags.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-white/40">No saved tags yet. Create tags on the Tags page.</div>
                      ) : (
                        [...new Set([...tagsList.map(t => t.name), ...allTags])].sort().map((tagName) => {
                          const currentTags = editingLead.tags ? editingLead.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];
                          const isSelected = currentTags.includes(tagName);
                          const tagInfo = tagsList.find(t => t.name === tagName);
                          return (
                            <div
                              key={tagName}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  const newTags = currentTags.filter((tag: string) => tag !== tagName);
                                  setEditingLead({ ...editingLead, tags: newTags.join(', ') });
                                } else {
                                  const newTags = [...currentTags, tagName];
                                  setEditingLead({ ...editingLead, tags: newTags.join(', ') });
                                }
                                setEditTagsDropdownOpen(false);
                              }}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 flex items-center justify-between ${isSelected ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
                            >
                              <span className="flex items-center gap-2">
                                {tagInfo?.color && (
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                                )}
                                {tagName}
                              </span>
                              {isSelected && <span className="text-emerald-400">✓</span>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Status</label>
                  <select
                    value={editingLead.status}
                    onChange={(e) => setEditingLead({ ...editingLead, status: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="new">New</option>
                    <option value="active">Active</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Disposition</label>
                  <select
                    value={editingLead.disposition}
                    onChange={(e) => setEditingLead({ ...editingLead, disposition: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">None</option>
                    <option value="sold">Sold</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="callback">Callback</option>
                    <option value="qualified">Qualified</option>
                    <option value="nurture">Nurture</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setEditLeadOpen(false); setEditingLead(null); setEditTagsDropdownOpen(false); }}
                className="px-4 py-2 text-sm text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLead}
                disabled={savingLead}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
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
              className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm outline-none w-[260px]"
            />

            {/* Action Buttons Group - prominent styling */}
            <button
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition shadow-sm"
              onClick={() => setAddLeadOpen(true)}
            >
              + Add Lead
            </button>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition shadow-sm"
              onClick={() => { setOpen(true); setRaw(null); setCampaignName(""); setBulkTags(""); setUploadTagsDropdownOpen(false); setNewTagInput(""); setNewTagColor("#f59e0b"); setUploadCampaignDropdownOpen(false); setNewCampaignInput(""); }}
            >
              Upload Leads
            </button>
            <button
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition shadow-sm"
              onClick={() => setRunOpen(true)}
            >
              Run Campaign
            </button>

            {/* Divider */}
            <div className="h-8 w-px bg-[#223246]"></div>

            {/* Filter Buttons Group - muted styling */}
            <div className="flex items-center gap-1 rounded-lg bg-[#0a0f16] border border-[#1a2535] p-1">
              {/* Campaigns dropdown (page filter) */}
              <div className="relative" data-campaign-menu>
                <button
                  className={`rounded-md px-3 py-1.5 text-sm min-w-[120px] text-left transition ${activeCampaignId ? 'bg-[#1a2535] text-white' : 'text-[#8899aa] hover:text-white hover:bg-[#151d28]'}`}
                  onClick={()=>{ setCampaignMenuOpen(v=>!v); setTagsMenuOpen(false); }}
                >
                  {activeCampaignId
                    ? campaigns.find(c=>c.id===activeCampaignId)?.name || "Selected"
                    : "Campaigns"}
                </button>
                {campaignMenuOpen && (
                  <div className="absolute right-0 mt-1 w-[280px] rounded-md border border-[#1a2637] bg-[#0f1722] shadow-lg z-10">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                      onClick={()=>{ setActiveCampaignId(null); setCampaignMenuOpen(false); }}
                    >
                      All campaigns
                    </button>
                    <div className="max-h-[260px] overflow-auto">
                      {campaigns.length===0 && (
                        <div className="px-3 py-2 text-[#9fb0c3] text-sm">No campaigns yet</div>
                      )}
                      {campaigns.map(c=>{
                        const leadCount = leads.filter(l => l.campaign_id === c.id).length;
                        return (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                            onClick={()=>{ setActiveCampaignId(c.id); setCampaignMenuOpen(false); }}
                          >
                            {c.name} <span className="text-[#9fb0c3]">({leadCount})</span>
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
                  className={`rounded-md px-3 py-1.5 text-sm min-w-[100px] text-left transition ${activeTagFilter ? 'bg-[#1a2535] text-white' : 'text-[#8899aa] hover:text-white hover:bg-[#151d28]'}`}
                  onClick={()=>{ setTagsMenuOpen(v=>!v); setCampaignMenuOpen(false); }}
                >
                  {activeTagFilter ? activeTagFilter : "Tags"}
                </button>
                {tagsMenuOpen && (
                  <div className="absolute right-0 mt-1 w-[240px] rounded-md border border-[#1a2637] bg-[#0f1722] shadow-lg z-10">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                      onClick={()=>{ setActiveTagFilter(null); setTagsMenuOpen(false); }}
                    >
                      All tags
                    </button>
                    <div className="max-h-[260px] overflow-auto">
                      {tagsList.length===0 && (
                        <div className="px-3 py-2 text-[#9fb0c3] text-sm">No tags yet</div>
                      )}
                      {tagsList.map(t=>(
                        <button
                          key={t.name}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a] flex items-center gap-2"
                          onClick={()=>{ setActiveTagFilter(t.name); setTagsMenuOpen(false); }}
                        >
                          {t.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                          {t.name} <span className="text-[#9fb0c3]">({t.count})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${hotLeadsOnly ? 'bg-[#ff6347]/20 text-[#ff6b6b]' : 'text-[#8899aa] hover:text-white hover:bg-[#151d28]'}`}
                onClick={() => { setHotLeadsOnly(v => !v); if (!hotLeadsOnly) setShowArchived(false); }}
                title="Filter for hot leads (score >= 70)"
              >
                Hot Leads
              </button>

              <label className={`rounded-md px-3 py-1.5 text-sm cursor-pointer transition text-[#8899aa] hover:text-white hover:bg-[#151d28]`}>
                AI Parse
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.txt,.json,.pdf,.doc,.docx"
                  onChange={handleAIParse}
                />
              </label>

              <button
                className="rounded-md px-3 py-1.5 text-sm text-[#8899aa] hover:text-white hover:bg-[#151d28] disabled:opacity-50 transition"
                onClick={recalculateLeadScores}
                disabled={recalculatingScores}
                title="Recalculate lead scores based on engagement"
              >
                {recalculatingScores ? '...' : 'Scores'}
              </button>

              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${showArchived ? 'bg-[#5a6b7f]/20 text-[#9fb0c3]' : 'text-[#8899aa] hover:text-white hover:bg-[#151d28]'}`}
                onClick={() => { setShowArchived(v => !v); if (!showArchived) setHotLeadsOnly(false); }}
                title="Show archived leads"
              >
                Archived
              </button>

              {/* Select All / Clear Selection buttons */}
              <button
                className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm hover:bg-[#101b2a] transition"
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
                    className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm hover:bg-[#101b2a]"
                    onClick={() => setBulkActionsOpen(v => !v)}
                  >
                    Bulk Actions ({selectedIds.size})
                  </button>
                  {bulkActionsOpen && (
                    <div className="absolute right-0 mt-1 w-[220px] rounded-md border border-[#1a2637] bg-[#0f1722] shadow-lg z-10">
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { setBulkActionModal('status'); setBulkActionsOpen(false); }}
                      >
                        Update Status
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { setBulkActionModal('disposition'); setBulkActionsOpen(false); }}
                      >
                        Update Disposition
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { setBulkActionModal('addTags'); setBulkActionsOpen(false); }}
                      >
                        Add Tags
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { setBulkActionModal('removeTags'); setBulkActionsOpen(false); }}
                      >
                        Remove Tags
                      </button>
                      <div className="border-t border-[#1a2637] my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { setBulkActionModal('createFollowUps'); setBulkActionsOpen(false); }}
                      >
                        Create Follow-ups
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a] text-emerald-400"
                        onClick={() => { setBulkActionModal('reDrip'); setBulkActionsOpen(false); }}
                      >
                        🔄 Re-Drip to Campaign
                      </button>
                      <div className="border-t border-[#1a2637] my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { exportLeads('csv'); setBulkActionsOpen(false); }}
                      >
                        Export to CSV
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={() => { exportLeads('json'); setBulkActionsOpen(false); }}
                      >
                        Export to JSON
                      </button>
                      <div className="border-t border-[#1a2637] my-1" />
                      {showArchived ? (
                        <button
                          className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-[#0f2a1a]"
                          onClick={() => { bulkUpdate({ status: 'new' }); setBulkActionsOpen(false); }}
                        >
                          📤 Unarchive Selected
                        </button>
                      ) : (
                        <button
                          className="w-full text-left px-3 py-2 text-sm text-[#9ca3af] hover:bg-[#1a1a1a]"
                          onClick={() => { bulkUpdate({ status: 'archived' }); setBulkActionsOpen(false); }}
                        >
                          📦 Archive Selected
                        </button>
                      )}
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#2a0f0f]"
                        onClick={() => { setBulkActionModal('delete'); setBulkActionsOpen(false); }}
                      >
                        Delete Selected
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="rounded-md border border-[#5a2424] bg-[#2a0f0f] px-3 py-2 text-sm text-[#ff6b6b] hover:bg-[#3a1515]"
                  onClick={deleteSelectedLeads}
                >
                  Delete Selected ({selectedIds.size})
                </button>
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
                  className={`px-2 py-1 rounded-full text-xs border ${active ? "bg-[#1a2f52] border-[#4876ff]" : "bg-[#0c1420] border-[#223246] hover:bg-[#101b2a]"}`}
                >
                  {tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={()=>setSelectedTags([])}
                className="px-2 py-1 rounded-full text-xs border bg-[#0c1420] border-[#223246] hover:bg-[#101b2a]"
              >
                Clear chips
              </button>
            )}
          </div>
        )}

        {/* Getting Started Tips */}
        {filtered.length === 0 && !q && !activeCampaignId && !activeTagFilter && (
          <div className="rounded-lg border border-[#1a4d7a] bg-[#0a1929] p-6">
            <h3 className="text-lg font-semibold mb-3 text-[#60a5fa]">💡 Getting Started</h3>
            <ol className="text-sm text-[#e7eef9] space-y-2 list-decimal list-inside">
              <li>
                <strong>Upload Leads:</strong> Click "Upload Leads" to import your contact list. <span className="text-[#9fb0c3]">Campaigns represent where you got the leads from (e.g., "Facebook Ads", "Trade Show 2024").</span>
              </li>
              <li>
                <strong>Create Campaigns & Tags:</strong> During upload, assign a campaign name. <span className="text-[#9fb0c3]">Tags are used for disposition or to mark where the lead is at in the prospecting process (e.g., "contacted", "interested", "cold").</span>
              </li>
              <li>
                <strong>Create a Flow:</strong> Visit the <a href="/templates" className="text-emerald-400 hover:underline">Flow</a> page to create a flow. <span className="text-[#9fb0c3]">This teaches the AI how to talk to selected campaigns with specific messaging strategies.</span>
              </li>
              <li>
                <strong>Start Bulk SMS:</strong> Once you have leads and a flow configured, go to <a href="/bulk-sms" className="text-emerald-400 hover:underline">Bulk SMS</a> to send messages to your leads at scale.
              </li>
            </ol>
          </div>
        )}

        {/* Leads table */}
        <div className="overflow-x-auto rounded-md border border-[#1a2637]">
          <table className="w-full border-collapse text-sm min-w-max">
            <thead>
              <tr className="bg-[#0f1722] text-left">
                <th className="border-b border-[#1a2637] px-3 py-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                {["Score","Name","Campaign","Email","Phone","State","Tags","Status","Disposition","Actions"].map(h => (
                  <th key={h} className="border-b border-[#1a2637] px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-3 py-4 text-[#9fb0c3]" colSpan={11}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td className="px-3 py-4 text-[#9fb0c3]" colSpan={11}>No leads found.</td></tr>
              )}
              {!loading && filtered.map((l, i) => {
                const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
                const id = String(l.id ?? i);
                const checked = selectedIds.has(id);
                const disposition = (l as any).disposition || "—";
                const isMenuOpen = dispositionMenuOpen[id] || false;
                const score = l.score ?? null;
                const temperature = l.temperature || null;
                const tempDisplay = temperature ? getTemperatureDisplay(temperature) : null;

                return (
                  <tr key={id} className="border-t border-[#1a2637] hover:bg-[#0c1420] cursor-pointer transition" onClick={() => viewLeadDetails(id)}>
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
                        <span className="text-[#9fb0c3] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2">
                      {l.campaign_id ? (
                        <span className="inline-block px-2 py-0.5 bg-[#1a2637] text-[#9fb0c3] rounded text-xs truncate max-w-[120px]">
                          {campaigns.find(c => c.id === l.campaign_id)?.name || "—"}
                        </span>
                      ) : (
                        <span className="text-[#9fb0c3]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.email || "—"}</td>
                    <td className="px-3 py-2">{l.phone || "—"}</td>
                    <td className="px-3 py-2">{l.state || "—"}</td>
                    <td className="px-3 py-2">{Array.isArray(l.tags) && l.tags.length ? l.tags.join(", ") : "—"}</td>
                    <td className="px-3 py-2">{l.status || "—"}</td>
                    <td className="px-3 py-2 relative" onClick={(e) => e.stopPropagation()} data-disposition-menu>
                      <button
                        className="text-sm text-[#9fb0c3] hover:text-[#e7eef9] underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDispositionMenuOpen(prev => ({ ...prev, [id]: !prev[id] }));
                        }}
                      >
                        {disposition === "—" ? "Set" : disposition.replace(/_/g, ' ')}
                      </button>
                      {isMenuOpen && (
                        <div className="absolute left-0 mt-1 w-[160px] rounded-md border border-[#1a2637] bg-[#0f1722] shadow-lg z-10">
                          {['sold', 'not_interested', 'callback', 'qualified', 'nurture'].map(disp => (
                            <button
                              key={disp}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateDisposition(id, disp);
                                setDispositionMenuOpen({});
                              }}
                            >
                              {disp.replace(/_/g, ' ')}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => deleteLead(id, name)}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {lastSummary?.ok && (
          <div className="rounded-md border border-[#1f3a5d] bg-[#0e1c2d] px-4 py-3 text-sm text-[#b8c9de]">
            <div className="font-semibold text-[#e7eef9] mb-1">Last import</div>
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
          <div className="w-full max-w-5xl rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Upload Leads</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={()=>setOpen(false)}>Close</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-[#9fb0c3]">Drop CSV, XLSX, JSON, PDF, DOCX, or TXT. Drag bubbles to map columns.</p>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#0e1826]">
                  <input type="file" className="hidden" onChange={handlePick} />
                  {busy ? "Processing…" : "Choose file"}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <div
                      className="min-h-[38px] rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
                      onClick={() => setUploadCampaignDropdownOpen(!uploadCampaignDropdownOpen)}
                    >
                      {campaignName ? (
                        <span className="text-[#e7eef9]">{campaignName}</span>
                      ) : (
                        <span className="text-white/40">Select or create campaign...</span>
                      )}
                      <span className="text-white/40">▼</span>
                    </div>
                    {uploadCampaignDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-white/10 bg-[#1a2332] z-50 shadow-lg">
                        {/* Create new campaign input */}
                        <div className="p-2 border-b border-white/10">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newCampaignInput}
                              onChange={(e) => setNewCampaignInput(e.target.value)}
                              placeholder="Create new campaign..."
                              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm outline-none focus:border-emerald-500"
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
                              className="px-2 py-1 rounded-md bg-emerald-500 text-white text-xs hover:bg-emerald-600"
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
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${!campaignName ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/60'}`}
                        >
                          No Campaign
                        </div>
                        {/* Saved campaigns list */}
                        {campaigns.length > 0 && (
                          <>
                            <div className="px-3 py-1 text-xs text-white/40 uppercase border-t border-white/10">Saved Campaigns</div>
                            {campaigns.map((camp) => (
                              <div
                                key={camp.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCampaignName(camp.name);
                                  setUploadCampaignDropdownOpen(false);
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 flex items-center justify-between ${campaignName === camp.name ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
                              >
                                <span>{camp.name}</span>
                                {campaignName === camp.name && <span className="text-emerald-400">✓</span>}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative flex-1">
                    <div
                      className="min-h-[38px] rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm cursor-pointer flex flex-wrap gap-1 items-center"
                      onClick={() => setUploadTagsDropdownOpen(!uploadTagsDropdownOpen)}
                    >
                      {bulkTags && bulkTags.split(',').filter((t: string) => t.trim()).length > 0 ? (
                        bulkTags.split(',').filter((t: string) => t.trim()).map((tag: string, idx: number) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                            {tag.trim()}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentTags = bulkTags.split(',').map((t: string) => t.trim()).filter(Boolean);
                                const newTags = currentTags.filter((t: string) => t !== tag.trim());
                                setBulkTags(newTags.join(', '));
                              }}
                              className="hover:text-white"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-white/40">Select or create tags...</span>
                      )}
                      <span className="ml-auto text-white/40">▼</span>
                    </div>
                    {uploadTagsDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-white/10 bg-[#1a2332] z-50 shadow-lg min-w-[320px]">
                        {/* Create new tag input */}
                        <div className="p-2 border-b border-white/10">
                          <div className="flex gap-2 items-center mb-2">
                            <input
                              type="text"
                              value={newTagInput}
                              onChange={(e) => setNewTagInput(e.target.value)}
                              placeholder="Create new tag..."
                              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
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
                              className="px-3 py-1.5 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 whitespace-nowrap"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/50">Color:</span>
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
                          <div className="px-3 py-2 text-sm text-white/40">No saved tags yet</div>
                        ) : (
                          <>
                            <div className="px-3 py-1 text-xs text-white/40 uppercase">Saved Tags</div>
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
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 flex items-center justify-between ${isSelected ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
                                >
                                  <span className="flex items-center gap-2">
                                    {t.color && (
                                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                    )}
                                    {t.name}
                                  </span>
                                  {isSelected && <span className="text-emerald-400">✓</span>}
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
                <div className="rounded-lg border border-[#203246] bg-[#0b1622] p-3">
                  <div className="mb-2 text-sm text-[#9fb0c3]">
                    Detected: <b className="text-[#e7eef9]">{(raw.detectedType||"").toUpperCase()}</b> • Parsed rows: <b className="text-[#e7eef9]">{raw.total}</b>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-widest text-[#95a9c5]">Detected columns</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(raw.preview?.[0] || {}).map(col=>(
                          <div
                            key={col}
                            draggable
                            onDragStart={(e)=>{ e.dataTransfer.setData("text/plain", col); }}
                            className="cursor-grab rounded-full border border-[#1a2a40] bg-[#0e1623] px-3 py-1 text-xs"
                          >
                            {col}
                          </div>
                        ))}
                        {!Object.keys(raw.preview?.[0] || {}).length && <div className="text-xs text-[#9fb0c3]">—</div>}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs uppercase tracking-widest text-[#95a9c5]">Map to fields</div>
                      <div className="grid grid-cols-2 gap-2">
                        {CANON_FIELDS.map((field)=>(
                          <div key={field}
                               onDrop={(e)=>{ e.preventDefault(); const col=e.dataTransfer.getData("text/plain"); if(col) assignMapping(field,col); }}
                               onDragOver={(e)=>e.preventDefault()}
                               className="rounded-md border border-dashed border-[#2a3e59] bg-[#0e1623] p-2">
                            <div className="mb-1 text-[11px] uppercase tracking-widest text-[#7ea0c6]">{field}</div>
                            {mapping[field] ? (
                              <div className="flex items-center justify-between rounded border border-[#1a2a40] bg-[#0c1420] px-2 py-1 text-xs">
                                <span>{mapping[field]}</span>
                                <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={()=>clearMapping(field)} type="button">×</button>
                              </div>
                            ) : (
                              <div className="text-xs text-[#5e7aa0]">Drop column here</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {raw?.ok && (
                <div className="rounded-lg border border-[#203246] bg-[#0b1622] p-3 text-sm">
                  <div className="max-h-[40vh] overflow-auto rounded-md border border-[#1a2a40]">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[#101a29]">
                          {CANON_FIELDS.map(h=>(
                            <th key={h} className="border-b border-[#1a2a40] px-3 py-2 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mappedPreview.map((r, i)=>(
                          <tr key={i} className="odd:bg-[#0e1623] even:bg-[#0c1420]">
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.first_name||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.last_name||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.phone||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.email||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.state||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.zip_code||""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{Array.isArray(r.tags)? r.tags.join(", "):""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.status||""}</td>
                          </tr>
                        ))}
                        {!mappedPreview.length && (
                          <tr><td colSpan={8} className="px-3 py-4 text-[#9fb0c3]">No rows detected.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end">
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
          <div className="w-full max-w-xl rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Run Campaign</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={()=>{ setRunOpen(false); setRunTagsDropdownOpen(false); }}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div className="grid gap-3">
                <select
                  value={runCampaignId}
                  onChange={(e)=>setRunCampaignId(e.target.value)}
                  className="rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                >
                  <option value="">{campaigns.length ? "Select a saved campaign…" : "No saved campaigns"}</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {/* Tags dropdown with saved tags and create new */}
                <div className="relative">
                  <label className="block text-xs text-[#9fb0c3] mb-1">Tags to apply (optional)</label>

                  {/* Selected tags display */}
                  {runTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {runTags.map(tag => {
                        const tagInfo = tagsList.find(t => t.name === tag);
                        return (
                          <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                            {tagInfo?.color && (
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                            )}
                            {tag}
                            <button
                              type="button"
                              onClick={() => setRunTags(runTags.filter(t => t !== tag))}
                              className="hover:text-white"
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
                    className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-left text-sm hover:bg-[#101b2a] flex items-center justify-between"
                  >
                    <span className="text-[#9fb0c3]">{runTags.length > 0 ? `${runTags.length} tag(s) selected` : 'Select or create tags...'}</span>
                    <span className="text-[#9fb0c3]">{runTagsDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {runTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-[#223246] bg-[#0c1420] shadow-lg z-50 max-h-[200px] overflow-y-auto">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-[#223246]">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={runNewTagInput}
                            onChange={(e) => setRunNewTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded border border-[#223246] bg-[#1a2332] px-2 py-1 text-xs outline-none"
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
                                  if (data.ok) setTagsList(data.tags || []);
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
                                  if (data.ok) setTagsList(data.tags || []);
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
                            className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30"
                          >
                            Add
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-[#9fb0c3]">Color:</span>
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
                        <div className="p-2 text-xs text-[#9fb0c3]">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-2 py-1 text-xs text-[#9fb0c3] bg-[#18273a]">Saved Tags</div>
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
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 justify-between ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-[#101b2a]'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </div>
                                {isSelected && <span className="text-emerald-400">✓</span>}
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
                    <label className="block text-xs text-[#9fb0c3] mb-1">Filter by State</label>
                    <button
                      type="button"
                      onClick={() => setRunStatesDropdownOpen(!runStatesDropdownOpen)}
                      className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-left text-sm hover:bg-[#101b2a] flex items-center justify-between"
                    >
                      <span className="text-[#9fb0c3] truncate">
                        {runStates.length > 0 ? runStates.join(', ') : 'All states'}
                      </span>
                      <span className="text-[#9fb0c3]">{runStatesDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    {runStatesDropdownOpen && (() => {
                      // Get unique states from leads
                      const uniqueStates = [...new Set(leads.map(l => l.state).filter(Boolean))].sort();
                      return (
                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-[#223246] bg-[#0c1420] shadow-lg z-50 max-h-[200px] overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setRunStates([]); setRunStatesDropdownOpen(false); }}
                            className={`w-full px-3 py-2 text-sm text-left hover:bg-[#101b2a] ${runStates.length === 0 ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
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
                                className={`w-full px-3 py-2 text-sm text-left hover:bg-[#101b2a] flex items-center justify-between ${isSelected ? 'bg-emerald-500/10' : ''}`}
                              >
                                <span>{state}</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-[#9fb0c3]">({count})</span>
                                  {isSelected && <span className="text-emerald-400">✓</span>}
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
                    <label className="block text-xs text-[#9fb0c3] mb-1">Filter by ZIP</label>
                    <input
                      value={runZipCodes}
                      onChange={(e)=>setRunZipCodes(e.target.value)}
                      placeholder="ZIP codes (comma-separated)"
                      className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none text-sm"
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
                    <div className="mt-2 border border-[#223246] rounded-lg overflow-hidden">
                      <div className="bg-[#18273a] px-3 py-2 text-xs text-[#9fb0c3] flex justify-between">
                        <span>Leads to include ({previewLeads.length})</span>
                        {previewLeads.length === 0 && <span className="text-amber-400">No leads selected</span>}
                      </div>
                      {previewLeads.length > 0 && (
                        <div className="max-h-[200px] overflow-y-auto">
                          {displayLeads.map(l => (
                            <div key={l.id} className="px-3 py-2 border-b border-[#223246] last:border-b-0 flex items-center justify-between text-sm hover:bg-[#101b2a]">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#223246] flex items-center justify-center text-xs font-medium">
                                  {(l.first_name?.[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium">{l.first_name} {l.last_name}</div>
                                  <div className="text-xs text-[#9fb0c3]">{l.phone || l.email || 'No contact'}</div>
                                </div>
                              </div>
                              <div className="text-xs text-[#9fb0c3]">{l.state || ''}</div>
                            </div>
                          ))}
                          {remainingCount > 0 && (
                            <div className="px-3 py-2 text-xs text-[#9fb0c3] text-center bg-[#0a0f16]">
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
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end">
              <button
                onClick={runCampaign}
                disabled={running || !runCampaignId}
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[400px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Update Status</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
              >
                <option value="">Select status...</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="sold">Sold</option>
              </select>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdate({ status: bulkStatus })}
                disabled={!bulkStatus}
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'disposition' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[400px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Update Disposition</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <select
                value={bulkDisposition}
                onChange={(e) => setBulkDisposition(e.target.value)}
                className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
              >
                <option value="">Select disposition...</option>
                <option value="sold">Sold</option>
                <option value="not_interested">Not Interested</option>
                <option value="callback">Callback</option>
                <option value="qualified">Qualified</option>
                <option value="nurture">Nurture</option>
              </select>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdate({ disposition: bulkDisposition })}
                disabled={!bulkDisposition}
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
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
          <div className="w-full max-w-lg rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[600px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Add Tags</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* Current tags on selected leads */}
              {currentTagsOnLeads.size > 0 && (
                <div>
                  <p className="text-xs text-[#9fb0c3] mb-2">Current tags on selected leads:</p>
                  <div className="flex flex-wrap gap-1">
                    {[...currentTagsOnLeads].map(tag => {
                      const tagInfo = tagsList.find(t => t.name === tag);
                      return (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-xs">
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
                <p className="text-xs text-[#9fb0c3] mb-2">Tags to add:</p>
                <div className="relative">
                  <div
                    className="min-h-[38px] rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 cursor-pointer flex flex-wrap gap-1 items-center"
                    onClick={() => setBulkAddTagsDropdownOpen(!bulkAddTagsDropdownOpen)}
                  >
                    {bulkAddTags && bulkAddTags.split(',').filter(t => t.trim()).length > 0 ? (
                      bulkAddTags.split(',').filter(t => t.trim()).map((tag, idx) => {
                        const tagInfo = tagsList.find(t => t.name === tag.trim());
                        return (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                            {tagInfo?.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />}
                            {tag.trim()}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentTags = bulkAddTags.split(',').map(t => t.trim()).filter(Boolean);
                                setBulkAddTags(currentTags.filter(t => t !== tag.trim()).join(', '));
                              }}
                              className="hover:text-white"
                            >×</button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-white/40">Select or create tags...</span>
                    )}
                    <span className="ml-auto text-white/40">▼</span>
                  </div>
                  {bulkAddTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-white/10 bg-[#1a2332] z-50 shadow-lg">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-white/10">
                        <div className="flex gap-2 items-center mb-2">
                          <input
                            type="text"
                            value={bulkNewTagInput}
                            onChange={(e) => setBulkNewTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
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
                            className="px-3 py-1.5 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600"
                          >Add</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/50">Color:</span>
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
                        <div className="px-3 py-2 text-sm text-white/40">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-3 py-1 text-xs text-white/40 uppercase">Saved Tags</div>
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
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-white/5 flex items-center justify-between ${isSelected ? 'bg-emerald-500/10 text-emerald-400' : ''}`}
                              >
                                <span className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </span>
                                {isSelected && <span className="text-emerald-400">✓</span>}
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
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => bulkUpdate({ clearTags: true })}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove all tags from selected leads
                </button>
              </div>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setBulkActionModal(null); setBulkAddTagsDropdownOpen(false); }}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={() => { bulkUpdate({ addTags: bulkAddTags.split(',').map(t => t.trim()).filter(Boolean) }); setBulkAddTagsDropdownOpen(false); }}
                disabled={!bulkAddTags.trim()}
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[600px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Manage Tags</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => { setBulkActionModal(null); setBulkRemoveTagsDropdownOpen(false); }}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* Current tags on selected leads */}
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-2">Current tags on selected leads (click to remove):</label>
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
                              : 'bg-[#18273a] border border-[#223246] hover:border-red-500/50 hover:bg-red-500/10'
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
                  <p className="text-xs text-[#9fb0c3] italic">No tags on selected leads</p>
                )}
              </div>

              {/* Replace with new tags section */}
              <div className="pt-3 border-t border-white/10">
                <label className="block text-xs text-[#9fb0c3] mb-2">Replace with tags (optional):</label>

                {/* Selected replacement tags */}
                {bulkReplaceTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {bulkReplaceTags.map(tag => {
                      const tagInfo = tagsList.find(t => t.name === tag);
                      return (
                        <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                          {tagInfo?.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo.color }} />
                          )}
                          {tag}
                          <button
                            type="button"
                            onClick={() => setBulkReplaceTags(bulkReplaceTags.filter(t => t !== tag))}
                            className="hover:text-white"
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
                    className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-left text-sm hover:bg-[#101b2a] flex items-center justify-between"
                  >
                    <span className="text-[#9fb0c3]">Select or create tags...</span>
                    <span className="text-[#9fb0c3]">{bulkRemoveTagsDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {bulkRemoveTagsDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-[#223246] bg-[#0c1420] shadow-lg z-50 max-h-[200px] overflow-y-auto min-w-[320px]">
                      {/* Create new tag */}
                      <div className="p-2 border-b border-[#223246]">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={bulkReplaceTagInput}
                            onChange={(e) => setBulkReplaceTagInput(e.target.value)}
                            placeholder="Create new tag..."
                            className="flex-1 rounded border border-[#223246] bg-[#1a2332] px-2 py-1 text-xs outline-none"
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
                                  if (data.ok) setTagsList(data.tags || []);
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
                                  if (data.ok) setTagsList(data.tags || []);
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
                            className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30"
                          >
                            Add
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-[#9fb0c3]">Color:</span>
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
                        <div className="p-2 text-xs text-[#9fb0c3]">No saved tags yet</div>
                      ) : (
                        <>
                          <div className="px-2 py-1 text-xs text-[#9fb0c3] bg-[#18273a]">Saved Tags</div>
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
                                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 justify-between ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-[#101b2a]'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {t.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />}
                                  {t.name}
                                </div>
                                {isSelected && <span className="text-emerald-400">✓</span>}
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
                  <p className="text-emerald-300">
                    Adding: {bulkReplaceTags.join(', ')}
                  </p>
                )}
                {tagsToRemove.length === 0 && bulkReplaceTags.length === 0 && (
                  <p className="text-[#9fb0c3]">Select tags to remove or add replacement tags</p>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => { bulkUpdate({ clearTags: true }); setBulkRemoveTagsDropdownOpen(false); }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove ALL tags
                </button>
                <span className="text-[#9fb0c3]">|</span>
                <button
                  type="button"
                  onClick={() => { setBulkRemoveTags(''); setBulkReplaceTags([]); }}
                  className="text-xs text-[#9fb0c3] hover:text-white"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setBulkActionModal(null); setBulkRemoveTagsDropdownOpen(false); setBulkReplaceTags([]); }}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
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
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[500px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Create Follow-ups</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-1">Title *</label>
                <input
                  value={bulkFollowUpTitle}
                  onChange={(e) => setBulkFollowUpTitle(e.target.value)}
                  placeholder="Follow up with {name}"
                  className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                />
                <p className="text-xs text-[#9fb0c3] mt-1">Use {`{name}`} to insert lead first name</p>
              </div>
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-1">Notes</label>
                <textarea
                  value={bulkFollowUpNotes}
                  onChange={(e) => setBulkFollowUpNotes(e.target.value)}
                  placeholder="Additional notes about this follow-up..."
                  className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-1">Due Date & Time *</label>
                <input
                  type="datetime-local"
                  value={bulkFollowUpDueDate}
                  onChange={(e) => setBulkFollowUpDueDate(e.target.value)}
                  className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-1">Priority</label>
                <select
                  value={bulkFollowUpPriority}
                  onChange={(e) => setBulkFollowUpPriority(e.target.value as any)}
                  className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <p className="text-xs text-[#9fb0c3]">
                Creating {selectedIds.size} follow-up(s) for selected leads
              </p>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={bulkCreateFollowUps}
                disabled={!bulkFollowUpTitle.trim() || !bulkFollowUpDueDate}
                className="rounded-md border border-[#22472c] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f] disabled:opacity-50"
              >
                Create Follow-ups
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'reDrip' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[500px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#a78bfa]">🔄 Re-Drip to Campaign</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs text-[#9fb0c3] mb-1">Select Campaign *</label>
                <select
                  value={reDripCampaignId}
                  onChange={(e) => setReDripCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                >
                  <option value="">Choose a campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[#9fb0c3] mt-1">
                  Re-enroll selected leads in this drip campaign
                </p>
              </div>
              <div className="p-3 bg-emerald-400/10 border border-emerald-400/30 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reDripResetProgress}
                    onChange={(e) => setReDripResetProgress(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-emerald-300">
                    Reset progress and start from beginning
                  </span>
                </label>
                <p className="text-xs text-emerald-300/60 mt-1 ml-6">
                  Leads will restart the campaign from step 1, even if they've completed it before
                </p>
              </div>
              <p className="text-xs text-[#9fb0c3]">
                Re-enrolling {selectedIds.size} lead(s) into the campaign
              </p>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
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
                className="rounded-md border border-emerald-400/30 bg-emerald-400/20 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-400/30 disabled:opacity-50"
              >
                Re-Enroll Leads
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'delete' && (
        <div className="fixed inset-0 md:left-64 z-[9999] flex justify-center bg-black/60 px-[4vh] pt-[20vh]" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[300px] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#ff6b6b]">Delete Leads</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={() => setBulkActionModal(null)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
              <p className="text-[#e7eef9]">
                Are you sure you want to delete {selectedIds.size} selected lead(s)?
              </p>
              <p className="text-[#ff6b6b]">
                This action cannot be undone. All associated data (threads, messages, follow-ups) will also be deleted.
              </p>
            </div>
            <div className="border-t border-[#18273a] px-4 py-3 flex justify-end gap-2">
              <button
                onClick={() => setBulkActionModal(null)}
                className="rounded-md border border-[#223246] bg-[#0c1420] px-4 py-2 text-sm hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={bulkDeleteLeads}
                className="rounded-md border border-[#5a2424] bg-[#2a0f0f] px-4 py-2 text-sm text-[#ff6b6b] hover:bg-[#3a1515]"
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
          <div className="w-full max-w-5xl rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold">
                  {leadName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">{leadName}</div>
                  <div className="text-sm text-[#9fb0c3]">{selectedLead?.phone || 'No phone'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { openEditLead(selectedLead); setSelectedLeadDetails(null); }}
                  className="px-3 py-1.5 rounded-md bg-[#1a2535] text-white text-sm hover:bg-[#243447] transition border border-[#2a3a4d]"
                >
                  Edit Lead
                </button>
                {selectedLead?.phone && (
                  <button
                    onClick={() => router.push(`/messages?phone=${encodeURIComponent(selectedLead.phone!)}&name=${encodeURIComponent(leadName)}`)}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
                  >
                    Send Message
                  </button>
                )}
                <button className="text-[#9fb0c3] hover:text-[#e7eef9] text-xl px-2" onClick={() => setSelectedLeadDetails(null)}>×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetails ? (
                <div className="text-center py-8 text-[#9fb0c3]">Loading details...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left Column - Lead Info & Activity */}
                  <div className="space-y-4">
                    {/* Contact Information */}
                    <div className="rounded-lg border border-[#203246] bg-[#0b1622] p-4">
                      <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Contact Information
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">Name</div>
                          <div className="text-white">{leadName}</div>
                        </div>
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">Phone</div>
                          <div className="text-white">{selectedLead?.phone || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">Email</div>
                          <div className="text-white break-all">{selectedLead?.email || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">State</div>
                          <div className="text-white">{selectedLead?.state || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">Status</div>
                          <div className="text-white capitalize">{selectedLead?.status || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[#9fb0c3] text-xs uppercase mb-1">Disposition</div>
                          <div className="text-white capitalize">{(selectedLead as any)?.disposition?.replace(/_/g, ' ') || '—'}</div>
                        </div>
                      </div>
                      {selectedLead?.tags && selectedLead.tags.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[#9fb0c3] text-xs uppercase mb-2">Tags</div>
                          <div className="flex flex-wrap gap-1">
                            {selectedLead.tags.map((tag, i) => (
                              <span key={i} className="px-2 py-1 rounded-full text-xs bg-[#1a2637] text-[#e7eef9]">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Activity Timeline */}
                    <div className="rounded-lg border border-[#203246] bg-[#0b1622] p-4">
                      <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Activity Timeline
                      </h3>
                      {leadActivities.length === 0 ? (
                        <p className="text-sm text-[#9fb0c3]">No activities recorded yet</p>
                      ) : (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {leadActivities.map((activity) => (
                            <div key={activity.id} className="border-l-2 border-emerald-500 pl-3 py-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-white capitalize">
                                    {activity.activity_type.replace(/_/g, ' ')}
                                  </div>
                                  <div className="text-sm text-[#9fb0c3] mt-1">
                                    {activity.description}
                                  </div>
                                </div>
                                <div className="text-xs text-[#9fb0c3] ml-3">
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
                    <div className="rounded-lg border border-[#203246] bg-[#0b1622] p-4 h-full">
                      <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Messages ({leadMessages.length})
                      </h3>
                      {leadMessages.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-[#9fb0c3] mb-3">No messages yet</p>
                          {selectedLead?.phone && (
                            <button
                              onClick={() => router.push(`/messages?phone=${encodeURIComponent(selectedLead.phone!)}&name=${encodeURIComponent(leadName)}`)}
                              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
                            >
                              Start Conversation
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {leadMessages.map((msg, i) => (
                            <div key={msg.id || i} className={`flex ${msg.direction === 'out' || msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                msg.direction === 'out' || msg.sender === 'agent'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-[#1a2637] text-[#e7eef9]'
                              }`}>
                                <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                                <div className={`text-xs mt-1 ${
                                  msg.direction === 'out' || msg.sender === 'agent' ? 'text-blue-200' : 'text-[#9fb0c3]'
                                }`}>
                                  {new Date(msg.created_at).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
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
    </div>
  );
}

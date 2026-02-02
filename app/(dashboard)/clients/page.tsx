"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Client = {
  id: string;
  user_id: string;
  original_lead_id?: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  email?: string;
  state?: string;
  zip_code?: string;
  tags?: string[];
  campaign_id?: string;
  source?: string;
  notes?: string;
  custom_fields?: Record<string, any>;
  converted_from_lead_at?: string;
  sold_date?: string;
  created_at: string;
  updated_at: string;
};

type Campaign = { id: string; name: string; [k: string]: any };
type Tag = { id?: string; name: string; color?: string; count: number };
type Message = { id: string; body: string; direction: string; sender: string; created_at: string };

export default function ClientsPage() {
  const router = useRouter();

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tagsList, setTagsList] = useState<Tag[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", notes: "", campaign_id: "" });
  const [saving, setSaving] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; action: () => void } | null>(null);

  // Tags filter dropdown
  const [tagsFilterOpen, setTagsFilterOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (selectedTags.length) params.set("tags", selectedTags.join(","));
      if (activeCampaignId) params.set("campaign_id", activeCampaignId);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/clients?${params.toString()}`);
      const data = await res.json();
      setClients(data?.items || []);
      setTotalCount(data?.total || 0);
    } catch (e) {
      console.error("Error fetching clients:", e);
    } finally {
      setLoading(false);
    }
  }, [q, selectedTags, activeCampaignId, currentPage, pageSize]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { setCurrentPage(1); }, [q, selectedTags, activeCampaignId]);

  // Fetch campaigns and tags
  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d?.campaigns || d?.items || [])).catch(() => {});
    fetch("/api/tags").then(r => r.json()).then(d => setTagsList(d?.items || [])).catch(() => {});
  }, []);

  // Fetch messages when client selected
  useEffect(() => {
    if (!selectedClient?.phone) { setMessages([]); return; }
    setMessagesLoading(true);
    fetch(`/api/messages/by-phone?phone=${encodeURIComponent(selectedClient.phone)}`)
      .then(r => r.json())
      .then(d => setMessages(d?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [selectedClient?.phone]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function bulkToggleAI(disable: boolean) {
    // Use original_lead_id from clients to find threads
    const selected = selectedIds.size > 0
      ? clients.filter(c => selectedIds.has(c.id))
      : clients;
    const leadIds = selected.map(c => c.original_lead_id).filter(Boolean);
    if (leadIds.length === 0) {
      showToast('No linked leads found');
      return;
    }
    try {
      const res = await fetch('/api/threads/bulk-ai-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, disable }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`AI ${disable ? 'disabled' : 'enabled'} for ${data.updated || 0} conversation(s)`);
      } else {
        showToast(`Error: ${data.error}`);
      }
    } catch {
      showToast('Failed to toggle AI');
    }
  }

  async function handleAddClient() {
    if (!newClient.phone.trim()) {
      showToast("Phone number is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newClient,
          tags: newClient.tags ? newClient.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          campaign_id: newClient.campaign_id || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Client added!");
        setAddOpen(false);
        setNewClient({ first_name: "", last_name: "", phone: "", email: "", state: "", zip_code: "", tags: "", notes: "", campaign_id: "" });
        fetchClients();
      } else {
        showToast(data.error || "Failed to add client");
      }
    } catch {
      showToast("Failed to add client");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditClient() {
    if (!editingClient) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editingClient.first_name,
          last_name: editingClient.last_name,
          phone: editingClient.phone,
          email: editingClient.email,
          state: editingClient.state,
          zip_code: editingClient.zip_code,
          tags: editingClient.tags,
          notes: editingClient.notes,
          campaign_id: editingClient.campaign_id || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Client updated!");
        setEditOpen(false);
        setEditingClient(null);
        fetchClients();
        if (selectedClient?.id === editingClient.id) {
          setSelectedClient(data.client);
        }
      } else {
        showToast(data.error || "Failed to update");
      }
    } catch {
      showToast("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert(clientId: string) {
    try {
      const res = await fetch("/api/clients/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Client reverted to lead!");
        setSelectedClient(null);
        fetchClients();
      } else {
        showToast(data.error || "Failed to revert");
      }
    } catch {
      showToast("Failed to revert");
    }
  }

  async function handleDelete(clientId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        showToast("Client deleted");
        setSelectedClient(null);
        fetchClients();
      } else {
        showToast(data.error || "Failed to delete");
      }
    } catch {
      showToast("Failed to delete");
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={() => { confirmModal.action(); setConfirmModal(null); }} className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clients</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sold customers converted from leads</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/clients?page=1&pageSize=1000');
                  const data = await res.json();
                  const allPhones = (data.items || []).map((c: any) => c.phone).filter(Boolean);
                  if (allPhones.length === 0) { showToast("No clients with phone numbers"); return; }
                  router.push(`/bulk-sms?phones=${encodeURIComponent(allPhones.join(","))}&source=clients`);
                } catch { showToast("Failed to load clients"); }
              }}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition shadow-sm"
            >
              Text All Clients
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={() => {
                    const selected = clients.filter(c => selectedIds.has(c.id));
                    const phones = selected.map(c => c.phone).filter(Boolean);
                    if (phones.length === 0) { showToast("No phone numbers found"); return; }
                    router.push(`/bulk-sms?phones=${encodeURIComponent(phones.join(","))}&source=clients`);
                  }}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition shadow-sm"
                >
                  Text Selected ({selectedIds.size})
                </button>
                <button
                  onClick={() => bulkToggleAI(false)}
                  className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 transition shadow-sm"
                >
                  Enable AI ({selectedIds.size})
                </button>
                <button
                  onClick={() => bulkToggleAI(true)}
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 transition shadow-sm"
                >
                  Disable AI ({selectedIds.size})
                </button>
              </>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition shadow-sm"
            >
              + Add Client
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search clients..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-64 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />

          {/* Tags filter */}
          <div className="relative">
            <button
              onClick={() => setTagsFilterOpen(!tagsFilterOpen)}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                selectedTags.length > 0
                  ? "border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                  : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300"
              }`}
            >
              Tags {selectedTags.length > 0 && `(${selectedTags.length})`} ▾
            </button>
            {tagsFilterOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-50 max-h-60 overflow-y-auto">
                {tagsList.map(tag => (
                  <button
                    key={tag.name}
                    onClick={() => {
                      setSelectedTags(prev =>
                        prev.includes(tag.name) ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                      );
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color || "#94a3b8" }} />
                    <span className="flex-1 text-slate-700 dark:text-slate-300">{tag.name}</span>
                    {selectedTags.includes(tag.name) && <span className="text-sky-500">✓</span>}
                  </button>
                ))}
                {tagsList.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No tags yet</div>}
              </div>
            )}
          </div>

          {/* Campaign filter */}
          <select
            value={activeCampaignId}
            onChange={e => setActiveCampaignId(e.target.value)}
            className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none text-slate-700 dark:text-slate-300"
          >
            <option value="">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {selectedTags.length > 0 && (
            <button onClick={() => setSelectedTags([])} className="text-xs text-sky-600 hover:underline">Clear filters</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
            <tr className="text-left text-slate-600 dark:text-slate-400 text-xs uppercase">
              <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-3">
                <input
                  type="checkbox"
                  checked={clients.length > 0 && clients.every(c => selectedIds.has(c.id))}
                  onChange={() => {
                    if (clients.every(c => selectedIds.has(c.id))) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(clients.map(c => c.id)));
                    }
                  }}
                />
              </th>
              {["Name", "Campaign", "Email", "Phone", "State", "Converted", ""].map(h => (
                <th key={h} className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading clients...</td></tr>
            )}
            {!loading && clients.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No clients found</td></tr>
            )}
            {!loading && clients.map(c => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
              const campaign = campaigns.find(cm => cm.id === c.campaign_id)?.name || "—";
              const convertedDate = c.converted_from_lead_at ? new Date(c.converted_from_lead_at).toLocaleDateString() : "—";
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedClient(c)}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition ${
                    selectedClient?.id === c.id ? "bg-sky-50 dark:bg-sky-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                      {name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{campaign}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.state || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{convertedDate}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingClient({ ...c });
                        setEditOpen(true);
                      }}
                      className="text-sky-600 hover:text-sky-700 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center justify-between text-sm">
          <div className="text-slate-500 dark:text-slate-400">
            Showing {startItem}–{endItem} of {totalCount}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs outline-none"
            >
              {[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded border border-slate-200 dark:border-slate-600 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded border border-slate-200 dark:border-slate-600 px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedClient && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedClient(null)} />
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 overflow-y-auto shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                  {(selectedClient.first_name?.[0] || "C").toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-lg text-emerald-700 dark:text-emerald-400">
                    {[selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" ") || "Unknown"}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedClient.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedClient.phone && (
                  <button
                    onClick={() => router.push(`/texts?phone=${encodeURIComponent(selectedClient.phone)}&name=${encodeURIComponent([selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" "))}`)}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 transition"
                  >
                    Send Message
                  </button>
                )}
                <button
                  onClick={() => router.push("/receptionist")}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition"
                >
                  AI Receptionist
                </button>
                <button
                  onClick={() => { setEditingClient({ ...selectedClient }); setEditOpen(true); }}
                  className="rounded-md border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Edit Client
                </button>
                <button
                  onClick={() => setConfirmModal({
                    open: true,
                    title: "Revert to Lead",
                    message: "This will move the client back to your leads list and delete the client record. Continue?",
                    action: () => handleRevert(selectedClient.id),
                  })}
                  className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  Revert to Lead
                </button>
                <button onClick={() => setSelectedClient(null)} className="text-slate-400 hover:text-slate-600 text-xl ml-2">×</button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Contact Info */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <h3 className="text-base font-semibold mb-3">Contact Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Name</div>
                    <div>{[selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" ") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Phone</div>
                    <div>{selectedClient.phone || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Email</div>
                    <div className="break-all">{selectedClient.email || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">State</div>
                    <div>{selectedClient.state || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Campaign</div>
                    <div>{campaigns.find(c => c.id === selectedClient.campaign_id)?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-1">Converted</div>
                    <div>{selectedClient.converted_from_lead_at ? new Date(selectedClient.converted_from_lead_at).toLocaleDateString() : "—"}</div>
                  </div>
                </div>
                {/* Tags */}
                <div className="mt-3">
                  <div className="text-slate-500 dark:text-slate-400 text-xs uppercase mb-2">Tags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClient.tags && selectedClient.tags.length > 0 ? (
                      selectedClient.tags.map((tag, i) => {
                        const tagInfo = tagsList.find(t => t.name === tag);
                        return (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tagInfo?.color || "#94a3b8" }} />
                            {tag}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-400">No tags</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <h3 className="text-base font-semibold mb-3">Messages ({messages.length})</h3>
                {messagesLoading ? (
                  <p className="text-sm text-slate-400">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-400 mb-3">No messages yet</p>
                    {selectedClient.phone && (
                      <button
                        onClick={() => router.push(`/texts?phone=${encodeURIComponent(selectedClient.phone)}&name=${encodeURIComponent([selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(" "))}`)}
                        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition"
                      >
                        Start Conversation
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "out" || msg.sender === "agent" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          msg.direction === "out" || msg.sender === "agent"
                            ? "bg-sky-500 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        }`}>
                          <p>{msg.body}</p>
                          <p className={`text-[10px] mt-1 ${
                            msg.direction === "out" || msg.sender === "agent" ? "text-sky-100" : "text-slate-400"
                          }`}>
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <h3 className="text-base font-semibold mb-3">Notes</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {selectedClient.notes || "No notes yet. Click Edit to add notes."}
                </p>
              </div>

              {/* Danger Zone */}
              <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4">
                <h3 className="text-base font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h3>
                <button
                  onClick={() => setConfirmModal({
                    open: true,
                    title: "Delete Client",
                    message: "This will permanently delete this client. This action cannot be undone.",
                    action: () => handleDelete(selectedClient.id),
                  })}
                  className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  Delete Client
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add Client</h3>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">First Name</label>
                  <input type="text" value={newClient.first_name} onChange={e => setNewClient({ ...newClient, first_name: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="John" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Last Name</label>
                  <input type="text" value={newClient.last_name} onChange={e => setNewClient({ ...newClient, last_name: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="Doe" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Phone *</label>
                <input type="tel" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="+1 (555) 123-4567" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email</label>
                <input type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="john@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">State</label>
                  <input type="text" value={newClient.state} onChange={e => setNewClient({ ...newClient, state: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="CA" maxLength={2} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Zip Code</label>
                  <input type="text" value={newClient.zip_code} onChange={e => setNewClient({ ...newClient, zip_code: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" placeholder="90210" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Pipeline Tags</label>
                <div className="flex flex-wrap gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 min-h-[38px]">
                  {tagsList.length === 0 && <span className="text-xs text-slate-400">No tags created yet</span>}
                  {tagsList.map(tag => {
                    const selected = (newClient.tags || "").split(",").filter(Boolean).includes(tag.name);
                    return (
                      <button key={tag.name} type="button" onClick={() => {
                        const current = (newClient.tags || "").split(",").filter(Boolean);
                        const updated = selected ? current.filter(t => t !== tag.name) : [...current, tag.name];
                        setNewClient({ ...newClient, tags: updated.join(",") });
                      }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${selected ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-400" : "bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500"}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || "#94a3b8" }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Campaign</label>
                <select value={newClient.campaign_id} onChange={e => setNewClient({ ...newClient, campaign_id: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500">
                  <option value="">No Campaign</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Notes</label>
                <textarea value={newClient.notes} onChange={e => setNewClient({ ...newClient, notes: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500 resize-none" rows={3} placeholder="Add notes..." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={handleAddClient} disabled={saving} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">
                {saving ? "Adding..." : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editOpen && editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Client</h3>
              <button onClick={() => { setEditOpen(false); setEditingClient(null); }} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">First Name</label>
                  <input type="text" value={editingClient.first_name || ""} onChange={e => setEditingClient({ ...editingClient, first_name: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Last Name</label>
                  <input type="text" value={editingClient.last_name || ""} onChange={e => setEditingClient({ ...editingClient, last_name: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Phone *</label>
                <input type="tel" value={editingClient.phone || ""} onChange={e => setEditingClient({ ...editingClient, phone: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email</label>
                <input type="email" value={editingClient.email || ""} onChange={e => setEditingClient({ ...editingClient, email: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">State</label>
                  <input type="text" value={editingClient.state || ""} onChange={e => setEditingClient({ ...editingClient, state: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" maxLength={2} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Zip Code</label>
                  <input type="text" value={editingClient.zip_code || ""} onChange={e => setEditingClient({ ...editingClient, zip_code: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Pipeline Tags</label>
                <div className="flex flex-wrap gap-2 p-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 min-h-[38px]">
                  {tagsList.length === 0 && <span className="text-xs text-slate-400">No tags created yet</span>}
                  {tagsList.map(tag => {
                    const selected = (editingClient.tags || []).includes(tag.name);
                    return (
                      <button key={tag.name} type="button" onClick={() => {
                        const current = editingClient.tags || [];
                        const updated = selected ? current.filter(t => t !== tag.name) : [...current, tag.name];
                        setEditingClient({ ...editingClient, tags: updated });
                      }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${selected ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-400" : "bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500"}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || "#94a3b8" }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Campaign</label>
                <select value={editingClient.campaign_id || ""} onChange={e => setEditingClient({ ...editingClient, campaign_id: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500">
                  <option value="">No Campaign</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Notes</label>
                <textarea value={editingClient.notes || ""} onChange={e => setEditingClient({ ...editingClient, notes: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-500 resize-none" rows={3} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setEditOpen(false); setEditingClient(null); }} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={handleEditClient} disabled={saving} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

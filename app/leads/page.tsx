"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
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

const CANON_FIELDS = ["first_name","last_name","phone","email","state","tags","status"] as const;
type Canon = typeof CANON_FIELDS[number];
type MapType = Record<Canon, string | "">;

function normalizeTags(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v ?? "").split(/[,|]/).map(s=>s.trim()).filter(Boolean);
}
function cap(s: string){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

export default function LeadsPage() {
  const [toast, setToast] = useState<string>("");

  /* Leads + filters */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* Campaigns/Tags sources for dropdowns */
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tagsList, setTagsList] = useState<{ tag: string; count: number }[]>([]);

  /* Dropdown UI */
  const [campaignMenuOpen, setCampaignMenuOpen] = useState(false);
  const [tagsMenuOpen, setTagsMenuOpen] = useState(false);

  /* Active dropdown selections (page-level filter) */
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) (Array.isArray(l.tags) ? l.tags : []).forEach(t => set.add(String(t)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [leads]);

  async function fetchLeads() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (selectedTags.length) params.set("tags", selectedTags.join(","));
      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(Array.isArray(data?.items) ? data.items : []);
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

  useEffect(() => { fetchLeads(); fetchCampaigns(); fetchTags(); }, []);
  useEffect(() => { fetchLeads(); }, [q, selectedTags]);

  /* Derived: apply page-level campaign/tag filters */
  const filtered = useMemo(() => {
    let arr = [...leads];
    if (activeCampaignId && campaigns.length) {
      const camp = campaigns.find(c => c.id === activeCampaignId);
      const setIds = new Set((camp?.lead_ids || []).map(String));
      arr = arr.filter(l => setIds.has(String(l.id ?? "")));
    }
    if (activeTagFilter) {
      arr = arr.filter(l => Array.isArray(l.tags) && l.tags.includes(activeTagFilter));
    }
    return arr;
  }, [leads, activeCampaignId, activeTagFilter, campaigns]);

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

  const detectedColumns = useMemo<string[]>(() => {
    const first = raw?.preview?.[0] || {};
    return Object.keys(first);
  }, [raw]);

  const initialMap = useMemo<MapType>(() => {
    const m: MapType = { first_name:"", last_name:"", phone:"", email:"", state:"", tags:"", status:"" };
    const cols = detectedColumns.map(c => [c, c.toLowerCase()] as const);
    for (const [orig, low] of cols) {
      if (low.includes("first")) m.first_name ||= orig;
      else if (low.includes("last")) m.last_name ||= orig;
      else if (/phone|cell|mobile|tel/.test(low)) m.phone ||= orig;
      else if (low.includes("mail")) m.email ||= orig;
      else if (low === "state" || low.includes("state")) m.state ||= orig;
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

    const proceed = confirm(
      `AI will parse "${file.name}" and extract lead information.\n\n` +
      `This costs 3 points. Continue?`
    );

    if (!proceed) {
      e.target.value = "";
      return;
    }

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
        alert(`Error: ${result.error || "Failed to parse document"}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || "Upload failed"}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const canImport = !!(raw?.ok && (raw?.total || 0) > 0);

  async function onImport() {
    if (!canImport) return;
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: mappedAll.length ? mappedAll : [],
          campaignName: campaignName.trim() || undefined,
          addTags: normalizeTags(bulkTags)
        })
      });
      const json = await res.json();
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
  const [runTags, setRunTags] = useState("");
  const [runScope, setRunScope] = useState<"selected"|"filtered">("selected");
  const [running, setRunning] = useState(false);

  async function runCampaign() {
    const ids = runScope === "selected"
      ? Array.from(selectedIds)
      : filtered.map(l => String(l.id ?? ""));
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
          addTags: normalizeTags(runTags)
        })
      });
      const j = await res.json();
      if (j?.ok) {
        setRunOpen(false);
        setRunCampaignId("");
        setRunTags("");
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
    <div className="min-h-screen bg-[#0b0f14] text-[#e7eef9]">
      <div className="sticky top-0 z-20 border-b border-[#152133] bg-[#0d121a] px-5 py-3">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <div className="font-semibold text-[#9fb0c3]">Welcome back 👋</div>
          <div className="text-xs text-[#9fb0c3]">v8 Sprint 1</div>
        </div>
      </div>

      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-[#1f3a2a] bg-[#0e1f17] px-4 py-2 text-sm text-[#8ff0a4] shadow">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-[1200px] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold">Leads</h2>
          <div className="flex gap-2 relative">
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Search name, email, phone, state, tag…"
              className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm outline-none w-[260px]"
            />

            {/* Campaigns dropdown (page filter) */}
            <div className="relative">
              <button
                className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm hover:bg-[#101b2a] min-w-[140px] text-left"
                onClick={()=>{ setCampaignMenuOpen(v=>!v); setTagsMenuOpen(false); }}
              >
                {activeCampaignId
                  ? `Campaigns: ${campaigns.find(c=>c.id===activeCampaignId)?.name || "Selected"}`
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
                    {campaigns.map(c=>(
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={()=>{ setActiveCampaignId(c.id); setCampaignMenuOpen(false); }}
                      >
                        {c.name} <span className="text-[#9fb0c3]">({c.lead_count ?? (c.lead_ids?.length || 0)})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tags dropdown (page filter) */}
            <div className="relative">
              <button
                className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm hover:bg-[#101b2a] min-w-[120px] text-left"
                onClick={()=>{ setTagsMenuOpen(v=>!v); setCampaignMenuOpen(false); }}
              >
                {activeTagFilter ? `Tags: ${activeTagFilter}` : "Tags"}
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
                        key={t.tag}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#101b2a]"
                        onClick={()=>{ setActiveTagFilter(t.tag); setTagsMenuOpen(false); }}
                      >
                        {t.tag} <span className="text-[#9fb0c3]">({t.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              className="rounded-md border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm hover:bg-[#101b2a]"
              onClick={() => { setOpen(true); setRaw(null); setCampaignName(""); setBulkTags(""); }}
            >
              Upload Leads
            </button>
            <label className="rounded-md border border-[#3b2f66] bg-[#1a0f33] px-3 py-2 text-sm text-[#b794f6] hover:bg-[#2a1650] cursor-pointer">
              AI Parse Document
              <input
                type="file"
                className="hidden"
                accept=".csv,.txt,.json,.pdf,.doc,.docx"
                onChange={handleAIParse}
              />
            </label>
            <button
              className="rounded-md border border-[#22472c] bg-[#0e1f17] px-3 py-2 text-sm text-[#8ff0a4] hover:bg-[#10301f]"
              onClick={() => setRunOpen(true)}
            >
              Run Campaign
            </button>
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

        {/* Leads table */}
        <div className="overflow-hidden rounded-md border border-[#1a2637]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#0f1722] text-left">
                <th className="border-b border-[#1a2637] px-3 py-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                {["Name","Email","Phone","State","Tags","Status"].map(h => (
                  <th key={h} className="border-b border-[#1a2637] px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-3 py-4 text-[#9fb0c3]" colSpan={7}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td className="px-3 py-4 text-[#9fb0c3]" colSpan={7}>No leads found.</td></tr>
              )}
              {!loading && filtered.map((l, i) => {
                const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "—";
                const id = String(l.id ?? i);
                const checked = selectedIds.has(id);
                return (
                  <tr key={id} className="border-t border-[#1a2637]">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checked} onChange={()=>toggleRow(id)} />
                    </td>
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2">{l.email || "—"}</td>
                    <td className="px-3 py-2">{l.phone || "—"}</td>
                    <td className="px-3 py-2">{l.state || "—"}</td>
                    <td className="px-3 py-2">{Array.isArray(l.tags) && l.tags.length ? l.tags.join(", ") : "—"}</td>
                    <td className="px-3 py-2">{l.status || "—"}</td>
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
        <div className="fixed inset-0 z-40 flex justify-center bg-black/60 px-[4vh] pt-[8vh] pb-[8vh]" onClick={backdropClick}>
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
                  <input
                    value={campaignName}
                    onChange={(e)=>setCampaignName(e.target.value)}
                    placeholder="Campaign name (optional)"
                    className="rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={bulkTags}
                    onChange={(e)=>setBulkTags(e.target.value)}
                    placeholder="Tags to apply (comma-separated)"
                    className="rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 text-sm outline-none"
                  />
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
                            <td className="border-b border-[#1a2a40] px-3 py-2">{Array.isArray(r.tags)? r.tags.join(", "):""}</td>
                            <td className="border-b border-[#1a2a40] px-3 py-2">{r.status||""}</td>
                          </tr>
                        ))}
                        {!mappedPreview.length && (
                          <tr><td colSpan={7} className="px-3 py-4 text-[#9fb0c3]">No rows detected.</td></tr>
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
      {runOpen && (
        <div className="fixed inset-0 z-40 flex justify-center bg-black/60 px-[4vh] pt-[8vh] pb-[8vh]" onClick={backdropClick}>
          <div className="w-full max-w-xl rounded-xl border border-[#203246] bg-[#0f1722] shadow-[0_10px_30px_rgba(0,0,0,.5)] flex max-h-[84vh] flex-col" onClick={stop}>
            <div className="flex items-center justify-between border-b border-[#18273a] px-4 py-3">
              <div className="text-sm uppercase tracking-[.18em] text-[#95a9c5]">Run Campaign</div>
              <button className="text-[#9fb0c3] hover:text-[#e7eef9]" onClick={()=>setRunOpen(false)}>Close</button>
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
                <input
                  value={runTags}
                  onChange={(e)=>setRunTags(e.target.value)}
                  placeholder="Tags to apply (comma-separated)"
                  className="rounded-lg border border-[#223246] bg-[#0c1420] px-3 py-2 outline-none"
                />
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
      )}
    </div>
  );
}

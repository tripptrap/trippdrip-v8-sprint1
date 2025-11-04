"use client";

import React from "react";

type Lead = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};

type ApiResponse = {
  items: Lead[];
  total: number;
  tagsAll: string[];
};

export default function MainTable() {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Lead[]>([]);
  const [total, setTotal] = React.useState(0);
  const [allTags, setAllTags] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  const fetchData = React.useCallback(async (q: string, tags: string[]) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("search", q.trim());
    if (tags.length) params.set("tags", tags.join(","));
    const res = await fetch(`/api/leads/list?${params.toString()}`, { cache: "no-store" });
    const data: ApiResponse = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
    setAllTags(data.tagsAll || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      fetchData(search, selectedTags);
    }, 250);
    return () => clearTimeout(t);
  }, [search, selectedTags, fetchData]);

  React.useEffect(() => {
    fetchData("", []);
  }, [fetchData]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, state, tag…"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>
        <div className="text-sm text-gray-600">
          {loading ? "Loading…" : `${total} result${total === 1 ? "" : "s"}`}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={[
                  "px-3 py-1 rounded-full border text-sm transition",
                  active
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                ].join(" ")}
              >
                {tag}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="px-3 py-1 rounded-full border text-sm bg-white text-gray-700 border-gray-300 hover:border-gray-500"
            >
              Clear tags
            </button>
          )}
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-600">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  No leads match your filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.map((l, idx) => {
              const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "—";
              return (
                <tr
                  key={`${l.id ?? idx}`}
                  className="border-t hover:bg-gray-50 cursor-default"
                >
                  <td className="px-3 py-2">{name}</td>
                  <td className="px-3 py-2">
                    {l.email ? (
                      <a href={`mailto:${l.email}`} className="underline underline-offset-2">
                        {l.email}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {l.phone ? (
                      <a href={`tel:${l.phone}`} className="underline underline-offset-2">
                        {l.phone}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">{l.state || "—"}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(l.tags) && l.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {l.tags.map((t, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full border border-gray-300 text-xs">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">{l.status || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

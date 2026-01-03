"use client";
import { useState, useEffect } from "react";
export type Filters = { q?:string; unread?:boolean; campaign?:string };
export default function FiltersBar({ onChange }:{ onChange:(f:Filters)=>void }){
  const [q,setQ] = useState(""); const [unread,setUnread] = useState(false); const [campaign,setCampaign] = useState("");
  useEffect(()=>{ onChange({ q: q||undefined, unread: unread||undefined, campaign: campaign||undefined }); },[q,unread,campaign]);
  return (
    <div className="flex flex-wrap gap-2">
      <input className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2" placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} />
      <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl">
        <input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)} /> Unread only
      </label>
      <select className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2" value={campaign} onChange={e=>setCampaign(e.target.value)}>
        <option value="">All campaigns</option>
        <option value="10">10</option>
        <option value="11">11</option>
        <option value="12">12</option>
      </select>
    </div>
  );
}

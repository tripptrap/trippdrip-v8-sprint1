"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadStore, STORE_UPDATED_EVENT } from "@/lib/localStore";
import { findLead as seedFindLead } from "@/lib/db";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads",     label: "Leads" },
  { href: "/bulk-sms",  label: "Bulk SMS" },
  { href: "/texts",     label: "Texts" },
  { href: "/email",     label: "Email" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/templates", label: "Flows" },
  { href: "/points",    label: "Points" },
  { href: "/tags",      label: "Tags" },
  { href: "/settings",  label: "Settings" },
];

function findLead(id:number, leads:any[]){ return (leads||[]).find((l:any)=> l.id===id) || seedFindLead(id); }

export default function Sidebar(){
  const path = usePathname();
  const [store, setStore] = useState<any>({ leads:[], threads:[] });

  useEffect(()=>{
    const sync = () => { const s = loadStore(); if (s) setStore(s); };
    sync();
    // listen to our same-tab event + browser storage for other tabs
    window.addEventListener(STORE_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") sync(); });
    return ()=>{
      window.removeEventListener(STORE_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", ()=>{});
    };
  }, []);

  const showTextList = path?.startsWith("/texts");
  const smsThreads = useMemo(()=> (store.threads || []).filter((t:any)=> t.channel === "sms"), [store]);
  const recent = useMemo(()=> {
    return [...smsThreads].sort((a:any,b:any)=> new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0, 10);
  }, [smsThreads]);

  return (
    <aside className="w-64 shrink-0 p-3 border-r border-white/10">
      <div className="text-lg font-semibold mb-3">TrippDrip</div>

      <nav className="space-y-1 mb-4">
        {navItems.map(it => {
          const active = path?.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href}
              className={`block px-3 py-2 rounded-xl ${active ? "bg-white/10" : "hover:bg-white/5"}`}>
              {it.label}
            </Link>
          );
        })}
      </nav>

      {showTextList && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)] px-1">Recent Texts</div>
          <div className="space-y-1">
            {recent.map((t:any)=>{
              const L = findLead(t.lead_id, store.leads||[]);
              return (
                <Link key={t.id} href={`/texts?open=${t.id}`} className={`block px-3 py-2 rounded-xl hover:bg-white/5 ${t.unread ? "border border-white/15" : ""}`} title={t.last_message_snippet}>
                  <div className="flex items-center justify-between">
                    <div className="truncate">{L?.first_name} {L?.last_name}</div>
                    {t.unread && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />}
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">{t.last_message_snippet}</div>
                </Link>
              );
            })}
            {(recent||[]).length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--muted)]">No SMS threads yet.</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

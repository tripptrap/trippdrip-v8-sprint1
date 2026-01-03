"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadStore, STORE_UPDATED_EVENT } from "@/lib/localStore";
import { findLead as seedFindLead } from "@/lib/db";
import { motion } from "framer-motion";

type NavItem = {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    children: [
      { href: "/analytics", label: "Analytics" },
      { href: "/follow-ups", label: "Follow-ups" },
    ]
  },
  {
    href: "/messages",
    label: "Messages",
    children: [
      { href: "/bulk-sms", label: "Bulk SMS" },
      { href: "/scheduled", label: "Scheduled" },
    ]
  },
  {
    href: "/email",
    label: "Calendar",
    children: [
      { href: "/appointments", label: "Appointments" },
    ]
  },
  { href: "/leads",     label: "Leads" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/tags",      label: "Tags" },
  { href: "/templates", label: "Flows" },
  { href: "/quoting",   label: "Quoting" },
  { href: "/points",    label: "Points" },
  { href: "/roadmap",   label: "Roadmap" },
  { href: "/settings",  label: "Settings" },
];

function findLead(id:number, leads:any[]){ return (leads||[]).find((l:any)=> l.id===id) || seedFindLead(id); }

export default function Sidebar(){
  const path = usePathname();
  const [store, setStore] = useState<any>({ leads:[], threads:[] });
  const [userPlan, setUserPlan] = useState<string>('basic');
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

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

  // Detect user plan type and listen for changes
  useEffect(() => {
    const updatePlan = async () => {
      try {
        const response = await fetch('/api/user/plan');
        const data = await response.json();

        if (data.ok && data.planType) {
          setUserPlan(data.planType);
        }
      } catch (e) {
        console.error('Error loading user plan:', e);
      }
    };

    updatePlan();

    // Listen for plan type changes
    const handlePlanChange = (event: any) => {
      if (event.detail?.planType) {
        setUserPlan(event.detail.planType);
      } else {
        updatePlan();
      }
    };

    window.addEventListener('planTypeChanged', handlePlanChange);
    window.addEventListener(STORE_UPDATED_EVENT, updatePlan);

    return () => {
      window.removeEventListener('planTypeChanged', handlePlanChange);
      window.removeEventListener(STORE_UPDATED_EVENT, updatePlan);
    };
  }, []);

  const showTextList = path?.startsWith("/texts");
  const smsThreads = useMemo(()=> (store.threads || []).filter((t:any)=> t.channel === "sms"), [store]);
  const recent = useMemo(()=> {
    return [...smsThreads].sort((a:any,b:any)=> new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0, 10);
  }, [smsThreads]);

  // Determine which logo to show
  const logoSrc = userPlan === 'premium' || userPlan === 'professional'
    ? '/logo-premium.png'
    : '/logo-basic.png';

  return (
    <aside className="w-64 shrink-0 p-3 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/50">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="text-lg font-semibold mb-6 flex items-center gap-3 px-2 text-slate-900 dark:text-slate-100"
      >
        <motion.div
          className="relative"
          animate={{
            boxShadow: [
              "0 0 15px rgba(14, 165, 233, 0.3)",
              "0 0 20px rgba(14, 165, 233, 0.4)",
              "0 0 15px rgba(14, 165, 233, 0.3)",
            ],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            borderRadius: "1rem",
          }}
        >
          <motion.img
            src={logoSrc}
            alt="HyveWyre™"
            className="h-12 w-12 rounded-2xl"
            animate={{
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            whileHover={{ scale: 1.05, rotate: 3 }}
          />
        </motion.div>
        <span className="text-xl text-slate-900 dark:text-slate-100">HyveWyre™</span>
      </motion.div>

      <nav className="space-y-1 mb-4">
        {navItems.map((it, index) => {
          const active = path?.startsWith(it.href);
          const hasChildren = it.children && it.children.length > 0;
          const isExpanded = expandedMenus.has(it.href);
          const childActive = hasChildren && it.children?.some(child => path?.startsWith(child.href));

          const toggleExpand = (e: React.MouseEvent) => {
            if (hasChildren) {
              e.preventDefault();
              setExpandedMenus(prev => {
                const newSet = new Set(prev);
                if (newSet.has(it.href)) {
                  newSet.delete(it.href);
                } else {
                  newSet.add(it.href);
                }
                return newSet;
              });
            }
          };

          return (
            <motion.div
              key={it.href}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              onMouseEnter={() => hasChildren && setExpandedMenus(prev => new Set(prev).add(it.href))}
              onMouseLeave={() => hasChildren && !childActive && setExpandedMenus(prev => {
                const newSet = new Set(prev);
                newSet.delete(it.href);
                return newSet;
              })}
            >
              {hasChildren ? (
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-150 ${
                    active || childActive
                      ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30"
                      : "hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <Link href={it.href} className="flex-1">
                    <motion.span
                      whileHover={{ x: 2 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      {it.label}
                    </motion.span>
                  </Link>
                  <motion.span
                    onClick={toggleExpand}
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs opacity-50 cursor-pointer px-2 py-1 hover:opacity-100"
                  >
                    ▼
                  </motion.span>
                </div>
              ) : (
                <Link href={it.href}
                  className={`block px-3 py-2 rounded-lg transition-all duration-150 ${
                    active
                      ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30"
                      : "hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}>
                  <motion.span
                    whileHover={{ x: 2 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    {it.label}
                  </motion.span>
                </Link>
              )}

              {/* Children submenu */}
              {hasChildren && (
                <motion.div
                  initial={false}
                  animate={{
                    height: isExpanded ? "auto" : 0,
                    opacity: isExpanded ? 1 : 0
                  }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pl-4 mt-1 space-y-1">
                    {it.children?.map((child) => {
                      const childIsActive = path?.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block px-3 py-1.5 rounded-md text-sm transition-all duration-150 ${
                            childIsActive
                              ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30"
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </nav>

      {showTextList && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-2"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 px-1">Recent Texts</div>
          <div className="space-y-1">
            {recent.map((t:any, index:number)=>{
              const L = findLead(t.lead_id, store.leads||[]);
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                >
                  <Link href={`/texts?open=${t.id}`} className={`block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 ${t.unread ? "border border-sky-200 dark:border-sky-500/30 bg-sky-50/50 dark:bg-sky-500/10" : ""}`} title={t.last_message_snippet}>
                    <div className="flex items-center justify-between">
                      <div className="truncate text-slate-900 dark:text-slate-100">{L?.first_name} {L?.last_name}</div>
                      {t.unread && (
                        <motion.span
                          className="ml-2 inline-block w-2 h-2 rounded-full bg-orange-500"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{t.last_message_snippet}</div>
                  </Link>
                </motion.div>
              );
            })}
            {(recent||[]).length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No SMS threads yet.</div>
            )}
          </div>
        </motion.div>
      )}
    </aside>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadStore, STORE_UPDATED_EVENT } from "@/lib/localStore";
import { findLead as seedFindLead } from "@/lib/db";
import { motion } from "framer-motion";
import {
  Shield,
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Users,
  UserCheck,
  Megaphone,
  Tag,
  Zap,
  FileText,
  Wallet,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { href: string; label: string }[];
  badge?: 'premium';
  color?: 'green';
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    children: [
      // Overview/Automation/SMS Delivery/Flow Analytics now live as tabs on
      // one page instead of 4 separate sidebar entries (issue #9). The
      // standalone routes still work if something else links to them
      // directly — only the nav entries were consolidated.
      { href: "/analytics", label: "Advanced Analytics" },
      { href: "/best-times", label: "Best Times" },
      { href: "/follow-ups", label: "Follow-ups" },
    ]
  },
  {
    href: "/texts",
    label: "Messages",
    icon: MessageSquare,
    children: [
      { href: "/texts?bulk=true", label: "Bulk SMS" },
      { href: "/scheduled", label: "Scheduled" },
    ]
  },
  { href: "/appointments", label: "Appointments", icon: Calendar },
  { href: "/leads",     label: "Leads", icon: Users },
  { href: "/clients",   label: "Clients", icon: UserCheck, color: 'green' },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/tags",      label: "Tags", icon: Tag },
  {
    href: "/flows",
    label: "AI Flows",
    icon: Zap,
    children: [
      { href: "/receptionist", label: "Receptionist" },
      { href: "/flow-analytics", label: "Flow Analytics" },
    ]
  },
  { href: "/quoting",   label: "Quoting", icon: FileText },
  {
    href: "/points",
    label: "Points",
    icon: Wallet,
    children: [
      { href: "/credit-history", label: "Usage History" },
    ]
  },
  { href: "/settings",  label: "Settings", icon: SettingsIcon },
];

function findLead(id:number, leads:any[]){ return (leads||[]).find((l:any)=> l.id===id) || seedFindLead(id); }

const RAIL_STORAGE_KEY = 'hyvewyre_sidebar_collapsed';
// Below this, the sidebar auto-collapses to an icon rail so it stops
// squeezing page content at tablet-ish widths — the range the mobile
// hamburger pattern (md:hidden) never covered (issue #8).
const AUTO_COLLAPSE_WIDTH = 1024;

export default function Sidebar(){
  const path = usePathname();
  const [store, setStore] = useState<any>({ leads:[], threads:[] });
  const [userPlan, setUserPlan] = useState<string>('growth');
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Collapse state: an explicit user toggle always wins (persisted); absent
  // that, auto-collapse below AUTO_COLLAPSE_WIDTH and re-expand above it.
  useEffect(() => {
    const stored = window.localStorage.getItem(RAIL_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === 'true');
      return;
    }
    const applyAuto = () => setCollapsed(window.innerWidth < AUTO_COLLAPSE_WIDTH);
    applyAuto();
    window.addEventListener('resize', applyAuto);
    return () => window.removeEventListener('resize', applyAuto);
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      window.localStorage.setItem(RAIL_STORAGE_KEY, String(next));
      return next;
    });
  }

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

  // Detect user plan type + admin status and listen for changes
  useEffect(() => {
    const updatePlan = async () => {
      try {
        const response = await fetch('/api/user/plan');
        const data = await response.json();

        if (data.ok && data.planType) {
          setUserPlan(data.planType);
        }
        if (data.isAdmin) {
          setIsAdmin(true);
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
  const logoSrc = userPlan === 'scale'
    ? '/logo-premium.png'
    : '/logo-basic.png';

  return (
    <aside className={`relative shrink-0 p-3 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/50 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-300 dark:hover:border-sky-600 flex items-center justify-center shadow-sm z-10"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className={`text-lg font-semibold mb-6 flex items-center gap-3 text-slate-900 dark:text-slate-100 ${collapsed ? 'justify-center px-0' : 'px-2'}`}
      >
        <motion.div
          className="relative shrink-0"
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
            className="h-9 w-9 rounded-xl"
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
        {!collapsed && <span className="text-xl text-slate-900 dark:text-slate-100 whitespace-nowrap">HyveWyre™</span>}
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

          const Icon = it.icon;
          // Submenus don't have room in the rail — collapse them away rather
          // than trying to squeeze a flyout in for v1. The parent icon still
          // navigates to its own href.
          const showChildren = hasChildren && !collapsed;

          return (
            <motion.div
              key={it.href}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              onMouseEnter={() => showChildren && setExpandedMenus(prev => new Set(prev).add(it.href))}
              onMouseLeave={() => showChildren && !childActive && setExpandedMenus(prev => {
                const newSet = new Set(prev);
                newSet.delete(it.href);
                return newSet;
              })}
            >
              {showChildren ? (
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-150 ${
                    active || childActive
                      ? "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30"
                      : "hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <Link href={it.href} className="flex-1 flex items-center gap-3">
                    <Icon className="w-[18px] h-[18px] shrink-0" />
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
                  title={collapsed ? it.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${collapsed ? 'justify-center px-0' : ''} ${
                    active
                      ? it.color === 'green'
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
                        : "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30"
                      : it.color === 'green'
                        ? "hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}>
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && (
                    <motion.span
                      whileHover={{ x: 2 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      {it.label}
                    </motion.span>
                  )}
                </Link>
              )}

              {/* Children submenu — never shown in the collapsed rail */}
              {showChildren && (
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

        {/* Admin Link - Only visible to admins */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <Link
              href="/admin"
              title={collapsed ? 'Admin' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${collapsed ? 'justify-center px-0' : ''} ${
                path?.startsWith('/admin')
                  ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30"
                  : "hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              <Shield className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>Admin</span>}
            </Link>
          </motion.div>
        )}
      </nav>

      {showTextList && !collapsed && (
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

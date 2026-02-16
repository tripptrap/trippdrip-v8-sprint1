"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { checkAndRenewCredits } from "@/lib/renewalSystem";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Headphones } from "lucide-react";

export default function Topbar(){
  const router = useRouter();
  const supabase = createClient();
  const [points, setPoints] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [flowAiActive, setFlowAiActive] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('flowAiActive') === 'true';
    return false;
  });
  const [receptionistActive, setReceptionistActive] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('receptionistActive') === 'true';
    return false;
  });
  const [togglingFlow, setTogglingFlow] = useState(false);
  const [togglingReceptionist, setTogglingReceptionist] = useState(false);

  useEffect(() => {
    // Get current user and load credits from Supabase
    const getUserAndCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser({
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          email: user.email,
          avatar: null
        });

        // Check for automatic monthly renewal
        const renewalResult = await checkAndRenewCredits();
        if (renewalResult.renewed) {
          toast.success(renewalResult.message || 'Credits renewed!', {
            duration: 5000,
            icon: '✨'
          });
        }

        // Fetch user credits from Supabase
        const { data: userData, error } = await supabase
          .from('users')
          .select('credits')
          .eq('id', user.id)
          .single();

        if (!error && userData) {
          setPoints(userData.credits || 0);
        }

        // AI toggle states are managed via localStorage + events
      }
    };
    getUserAndCredits();

    // Listen for points updates
    const handlePointsUpdate = (e: any) => {
      setPoints(e.detail.balance);
    };

    // Listen for AI toggle updates
    const handleAiToggle = (e: any) => {
      if (e.detail.type === 'flow') setFlowAiActive(e.detail.active);
      if (e.detail.type === 'receptionist') setReceptionistActive(e.detail.active);
    };

    window.addEventListener('pointsUpdated', handlePointsUpdate);
    window.addEventListener('aiToggled', handleAiToggle);
    return () => {
      window.removeEventListener('pointsUpdated', handlePointsUpdate);
      window.removeEventListener('aiToggled', handleAiToggle);
    };
  }, []);

  // Determine dot color based on points
  const getDotColor = () => {
    if (points < 10) return 'bg-red-500';
    if (points < 500) return 'bg-sky-400';
    return 'bg-sky-500';
  };

  async function handleToggleFlow() {
    if (togglingFlow) return;
    const newState = !flowAiActive;
    setTogglingFlow(true);
    setFlowAiActive(newState);
    try {
      await fetch('/api/threads/bulk-ai-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, disable: !newState, contactType: 'lead' }),
      });
      localStorage.setItem('flowAiActive', String(newState));
      toast.success(`AI Flow ${newState ? 'enabled' : 'disabled'} for all leads`);
      window.dispatchEvent(new CustomEvent('aiToggled', { detail: { type: 'flow', active: newState } }));
    } catch {
      setFlowAiActive(!newState);
      toast.error('Failed to toggle AI Flow');
    }
    setTogglingFlow(false);
  }

  async function handleToggleReceptionist() {
    if (togglingReceptionist) return;
    const newState = !receptionistActive;
    setTogglingReceptionist(true);
    setReceptionistActive(newState);
    try {
      await fetch('/api/threads/bulk-ai-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, disable: !newState, contactType: 'client' }),
      });
      localStorage.setItem('receptionistActive', String(newState));
      toast.success(`Receptionist ${newState ? 'enabled' : 'disabled'} for all clients`);
      window.dispatchEvent(new CustomEvent('aiToggled', { detail: { type: 'receptionist', active: newState } }));
    } catch {
      setReceptionistActive(!newState);
      toast.error('Failed to toggle Receptionist');
    }
    setTogglingReceptionist(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-sm text-slate-600 dark:text-slate-400"
      >
        Welcome back, {user?.name || user?.email?.split('@')[0] || 'User'}
      </motion.div>

      <div className="flex items-center gap-4">
        {/* AI Toggle Buttons */}
        <div className="flex items-center gap-2">
          {/* AI Flow (Leads) */}
          <motion.button
            onClick={handleToggleFlow}
            disabled={togglingFlow}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none overflow-hidden ${
              flowAiActive
                ? 'bg-sky-500/15 text-sky-400 border border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 hover:border-sky-400/40 hover:text-sky-400'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={flowAiActive ? 'Click to disable AI Flow for leads' : 'Click to enable AI Flow for leads'}
          >
            {flowAiActive && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-lg bg-sky-400/10"
                  animate={{ opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ boxShadow: '0 0 15px rgba(56,189,248,0.4), inset 0 0 15px rgba(56,189,248,0.1)' }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </>
            )}
            <Bot className={`w-4 h-4 relative z-10 ${togglingFlow ? 'animate-spin' : ''}`} />
            <span className="relative z-10">Flow</span>
            {flowAiActive && (
              <motion.div
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-400 z-20 shadow-[0_0_6px_rgba(56,189,248,0.8)]"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>

          {/* Receptionist (Clients) */}
          <motion.button
            onClick={handleToggleReceptionist}
            disabled={togglingReceptionist}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none overflow-hidden ${
              receptionistActive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 hover:border-emerald-400/40 hover:text-emerald-400'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={receptionistActive ? 'Click to disable Receptionist for clients' : 'Click to enable Receptionist for clients'}
          >
            {receptionistActive && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-lg bg-emerald-400/10"
                  animate={{ opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ boxShadow: '0 0 15px rgba(52,211,153,0.4), inset 0 0 15px rgba(52,211,153,0.1)' }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </>
            )}
            <Headphones className={`w-4 h-4 relative z-10 ${togglingReceptionist ? 'animate-spin' : ''}`} />
            <span className="relative z-10">Receptionist</span>
            {receptionistActive && (
              <motion.div
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 z-20 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>

        {/* Points Balance */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link href="/points" className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 px-3 py-1.5 rounded-lg transition-colors">
            <motion.div
              className={`w-2 h-2 rounded-full ${getDotColor()}`}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="text-right">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {points.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">points</div>
            </div>
          </Link>
        </motion.div>

        {/* User Menu */}
        <div className="relative">
          <motion.button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 px-3 py-2 rounded-lg transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div
              className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white font-medium"
              whileHover={{ rotate: 3 }}
            >
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </motion.div>
            <motion.svg
              className="w-4 h-4 text-slate-500 dark:text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={{ rotate: showUserMenu ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </motion.button>

          <AnimatePresence>
            {showUserMenu && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-56 sm:w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{user?.name || 'User'}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate break-all" title={user?.email || ''}>{user?.email || ''}</div>
                  </div>
                  <div className="py-1">
                    <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.15 }} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <Link href="/settings" className="block px-4 py-2 text-slate-700 dark:text-slate-300 transition-colors" onClick={() => setShowUserMenu(false)}>
                        Settings
                      </Link>
                    </motion.div>
                    <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.15 }} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <Link href="/points" className="block px-4 py-2 text-slate-700 dark:text-slate-300 transition-colors" onClick={() => setShowUserMenu(false)}>
                        Buy Points
                      </Link>
                    </motion.div>
                    <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                    <motion.button
                      onClick={async () => {
                        const { error } = await supabase.auth.signOut();
                        if (error) {
                          toast.error('Failed to sign out');
                        } else {
                          toast.success('Signed out successfully');
                          router.push('/auth/login');
                          router.refresh();
                        }
                      }}
                      className="w-full text-left px-4 py-2 transition-colors text-red-500 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.15 }}
                    >
                      Sign Out
                    </motion.button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-sm text-slate-400 dark:text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-4"
        >
          v8.0
        </motion.div>
      </div>
    </motion.div>
  );
}

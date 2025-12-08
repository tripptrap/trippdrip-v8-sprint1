"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { checkAndRenewCredits } from "@/lib/renewalSystem";
import { motion, AnimatePresence } from "framer-motion";

export default function Topbar(){
  const router = useRouter();
  const supabase = createClient();
  const [points, setPoints] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);

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
      }
    };
    getUserAndCredits();

    // Listen for points updates
    const handlePointsUpdate = (e: any) => {
      setPoints(e.detail.balance);
    };

    window.addEventListener('pointsUpdated', handlePointsUpdate);
    return () => window.removeEventListener('pointsUpdated', handlePointsUpdate);
  }, []);

  // Determine dot color based on points
  const getDotColor = () => {
    if (points < 10) return 'bg-red-500';
    if (points < 500) return 'bg-emerald-400';
    return 'bg-emerald-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-between p-3 border-b border-white/10"
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-sm text-[var(--muted)]"
      >
        Welcome back, {user?.name || user?.email?.split('@')[0] || 'User'}
      </motion.div>

      <div className="flex items-center gap-4">
        {/* Points Balance */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Link href="/points" className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
            <motion.div
              className={`w-2 h-2 rounded-full ${getDotColor()}`}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="text-right">
              <div className="font-bold text-white">
                {points.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--muted)]">points</div>
            </div>
          </Link>
        </motion.div>

        {/* User Menu */}
        <div className="relative">
          <motion.button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div
              className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold"
              whileHover={{ rotate: 5 }}
            >
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </motion.div>
            <motion.svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={{ rotate: showUserMenu ? 180 : 0 }}
              transition={{ duration: 0.3 }}
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
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-64 bg-[#1a1f2e] border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden"
                >
                  <div className="p-3 border-b border-white/10">
                    <div className="font-medium text-white truncate">{user?.name || 'User'}</div>
                    <div className="text-sm text-[var(--muted)] truncate break-all" title={user?.email || ''}>{user?.email || ''}</div>
                  </div>
                  <div className="py-1">
                    <motion.div whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.05)" }} transition={{ duration: 0.2 }}>
                      <Link href="/settings" className="block px-4 py-2 transition-colors" onClick={() => setShowUserMenu(false)}>
                        Settings
                      </Link>
                    </motion.div>
                    <motion.div whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.05)" }} transition={{ duration: 0.2 }}>
                      <Link href="/points" className="block px-4 py-2 transition-colors" onClick={() => setShowUserMenu(false)}>
                        Buy Points
                      </Link>
                    </motion.div>
                    <div className="border-t border-white/10 my-1" />
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
                      className="w-full text-left px-4 py-2 transition-colors text-red-400"
                      whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                      transition={{ duration: 0.2 }}
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
          className="text-sm text-[var(--muted)] border-l border-white/10 pl-4"
        >
          v8.0
        </motion.div>
      </div>
    </motion.div>
  );
}

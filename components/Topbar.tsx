"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadPoints, checkMonthlyRenewal } from "@/lib/pointsStore";

export default function Topbar(){
  const [points, setPoints] = useState(1000);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Mock user data - will be replaced with real auth
  const user = {
    name: "Demo User",
    email: "demo@trippdrip.com",
    avatar: null
  };

  useEffect(() => {
    // Check for monthly renewal
    checkMonthlyRenewal();

    // Load initial points
    const data = loadPoints();
    setPoints(data.balance);

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
    if (points < 500) return 'bg-orange-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center justify-between p-3 border-b border-white/10">
      <div className="text-sm text-[var(--muted)]">Welcome back, {user.name}</div>

      <div className="flex items-center gap-4">
        {/* Points Balance */}
        <Link href="/points" className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
          <div className={`w-2 h-2 rounded-full ${getDotColor()}`} />
          <div className="text-right">
            <div className="font-bold text-white">
              {points.toLocaleString()}
            </div>
            <div className="text-[10px] text-[var(--muted)]">points</div>
          </div>
        </Link>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
              {user.name.charAt(0)}
            </div>
            <svg className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-[#1a1f2e] border border-white/10 rounded-lg shadow-xl z-20">
                <div className="p-3 border-b border-white/10">
                  <div className="font-medium text-white">{user.name}</div>
                  <div className="text-sm text-[var(--muted)]">{user.email}</div>
                </div>
                <div className="py-1">
                  <Link href="/settings" className="block px-4 py-2 hover:bg-white/5 transition-colors" onClick={() => setShowUserMenu(false)}>
                    Settings
                  </Link>
                  <Link href="/points" className="block px-4 py-2 hover:bg-white/5 transition-colors" onClick={() => setShowUserMenu(false)}>
                    Buy Points
                  </Link>
                  <div className="border-t border-white/10 my-1" />
                  <button className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors text-red-400">
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="text-sm text-[var(--muted)] border-l border-white/10 pl-4">v8.0</div>
      </div>
    </div>
  );
}

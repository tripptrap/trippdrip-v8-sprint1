"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, ShoppingCart, X } from 'lucide-react';

/**
 * Full-viewport overlay that appears when the user's credit balance reaches zero.
 * Polls every 30 s and automatically dismisses once credits are restored.
 * Cannot be closed without purchasing — the only escape is buying credits or
 * navigating to /points.
 */
export default function ZeroCreditsModal() {
  const [credits, setCredits] = useState<number | null>(null);
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  // Don't show on the points page itself — the user is already there
  const isPointsPage = pathname?.startsWith('/points');

  const fetchCredits = async () => {
    try {
      const res = await fetch('/api/user/credits');
      const data = await res.json();
      if (data.ok && typeof data.credits === 'number') {
        setCredits(data.credits);
        if (data.credits === 0) {
          setShow(true);
        } else {
          setShow(false); // Credits restored — auto-dismiss
        }
      }
    } catch {
      // Silently fail — don't block UI on network errors
    }
  };

  useEffect(() => {
    fetchCredits();
    const interval = setInterval(fetchCredits, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!show || isPointsPage || credits === null) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Red header bar */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Out of Credits</h2>
          <p className="text-red-100 text-sm">
            SMS and AI features are paused until you top up.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <ul className="space-y-2 mb-6">
            {[
              'Sending SMS messages',
              'AI auto-responses & Flows',
              'Bulk campaigns',
              'AI Drip sequences',
            ].map(item => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
            Your account and all data remain intact. Purchase a credit pack to resume.
          </p>

          <Link
            href="/points"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/30"
          >
            <ShoppingCart className="w-5 h-5" />
            Buy Credits Now
          </Link>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-3">
            This message will disappear automatically once your credits are restored.
          </p>
        </div>
      </div>
    </div>
  );
}

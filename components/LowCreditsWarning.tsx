"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, X, AlertTriangle } from 'lucide-react';

export default function LowCreditsWarning() {
  const [credits, setCredits] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/user/credits')
      .then(r => r.json())
      .then(data => {
        if (data.ok && typeof data.credits === 'number') {
          setCredits(data.credits);
        }
      })
      .catch(() => {});
  }, []);

  // Refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/user/credits')
        .then(r => r.json())
        .then(data => {
          if (data.ok && typeof data.credits === 'number') {
            setCredits(data.credits);
            // Re-show banner if credits hit 0 (even if previously dismissed)
            if (data.credits === 0) setDismissed(false);
          }
        })
        .catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  if (credits === null || credits > 50 || dismissed) return null;

  const isOut = credits === 0;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-2.5 text-sm ${
        isOut
          ? 'bg-red-600 dark:bg-red-700 text-white'
          : 'bg-amber-500 dark:bg-amber-600 text-white'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isOut ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        ) : (
          <Zap className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="truncate">
          {isOut
            ? "You're out of credits — SMS and AI features are paused."
            : `Low credits: ${credits} remaining — SMS and AI will stop at zero.`}
        </span>
      </div>
      <Link
        href="/points"
        className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
          isOut
            ? 'bg-white text-red-600 hover:bg-red-50'
            : 'bg-white text-amber-600 hover:bg-amber-50'
        }`}
      >
        Buy Credits
      </Link>
      {!isOut && (
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 p-1 rounded-md hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

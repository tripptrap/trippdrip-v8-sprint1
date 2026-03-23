"use client";

import { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Zap } from 'lucide-react';

interface OutOfCreditsBlockerProps {
  credits: number;
  onBuyCredits?: () => void;
  children: ReactNode;
}

/**
 * Wraps children with a blocking overlay when the user has 0 credits.
 * When credits > 0, children render normally with no overhead.
 */
export default function OutOfCreditsBlocker({
  credits,
  onBuyCredits,
  children,
}: OutOfCreditsBlockerProps) {
  if (credits > 0) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Render children underneath but disable interaction */}
      <div className="pointer-events-none select-none opacity-40" aria-hidden="true">
        {children}
      </div>

      {/* Blocking overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-[2px] rounded-b-xl">
        <div className="text-center px-6 py-5 max-w-sm">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
            You&apos;re out of credits
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            SMS and AI features require credits to use. Purchase more to continue sending messages.
          </p>
          {onBuyCredits ? (
            <button
              onClick={onBuyCredits}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Zap className="w-4 h-4" />
              Buy Credits
            </button>
          ) : (
            <Link
              href="/points"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Zap className="w-4 h-4" />
              Buy Credits
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

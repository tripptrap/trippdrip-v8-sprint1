'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Public page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
          Page Error
        </h1>
        <p className="text-gray-600 dark:text-slate-400 mb-6">
          We couldn&apos;t load this page. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/preview"
            className="px-6 py-3 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error caught:', error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
          {/* Icon */}
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-slate-400">
              We hit an unexpected error while loading this page. Don&apos;t worry, your data is safe.
            </p>
          </div>

          {/* Error Details (collapsible) */}
          <details className="mb-6 bg-gray-50 dark:bg-slate-900 rounded-lg p-4">
            <summary className="text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer hover:text-gray-900 dark:hover:text-slate-100">
              Technical Details
            </summary>
            <div className="mt-3 text-sm">
              <p className="text-gray-600 dark:text-slate-400 break-words">
                <span className="font-medium">Error:</span> {error.message || 'Unknown error'}
              </p>
              {error.digest && (
                <p className="text-gray-500 dark:text-slate-500 mt-1">
                  <span className="font-medium">ID:</span> {error.digest}
                </p>
              )}
            </div>
          </details>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Link>
          </div>

          {/* Back link */}
          <div className="mt-6 text-center">
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Go back to previous page
            </button>
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-sm text-gray-500 dark:text-slate-500 mt-4">
          If this keeps happening, please{' '}
          <Link href="/contact" className="text-sky-600 hover:text-sky-700 dark:text-sky-400">
            contact support
          </Link>
        </p>
      </div>
    </div>
  );
}

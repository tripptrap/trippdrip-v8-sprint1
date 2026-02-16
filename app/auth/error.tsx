'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Auth error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">HW</span>
          </div>
          <span className="text-xl font-bold text-gray-900">HyveWyre</span>
        </div>

        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-red-600"
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

        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Authentication Error
        </h1>
        <p className="text-gray-600 mb-6">
          We encountered a problem during authentication. Please try again.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/auth/login"
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back to Login
          </Link>
        </div>

        <p className="text-sm text-gray-500 mt-6">
          Need help?{' '}
          <a href="mailto:support@hyvewyre.com" className="text-teal-600 hover:text-teal-700">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}

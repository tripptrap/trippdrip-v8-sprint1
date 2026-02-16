import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Illustration */}
        <div className="mb-8">
          <div className="text-9xl font-bold text-gray-200 dark:text-slate-700">404</div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have been moved or doesn&apos;t exist.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/preview"
            className="px-6 py-3 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
          >
            Visit Homepage
          </Link>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-500 mt-8">
          Need help?{' '}
          <Link href="/contact" className="text-sky-600 hover:text-sky-700 dark:text-sky-400">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  );
}

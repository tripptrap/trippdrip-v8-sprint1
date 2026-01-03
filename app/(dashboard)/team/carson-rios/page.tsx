'use client';

import { Mail, MapPin, Shield, Briefcase } from 'lucide-react';

export default function CarsonRiosPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start gap-6">
          {/* Profile Image Placeholder */}
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-sky-400 to-sky-400 flex items-center justify-center flex-shrink-0">
            <span className="text-5xl font-bold text-gray-900">CR</span>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Carson Rios</h1>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="px-3 py-1 bg-blue-900/30 border border-sky-700 text-sky-600 rounded-full text-sm font-medium">
                Operations
              </div>
              <div className="px-3 py-1 bg-sky-800/60 border border-sky-600 text-sky-600 rounded-full text-sm font-medium">
                Authorized Representative
              </div>
              <div className="px-3 py-1 bg-amber-900/30 border border-amber-600 text-amber-400 rounded-full text-sm font-medium">
                CEO
              </div>
            </div>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              Authorized Representative for HyveWyre
            </p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Role & Responsibilities */}
        <div className="card">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Role</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Operations / Authorized Representative for HyveWyre
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Responsibilities</h4>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Operational oversight and management</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Authorized representative for company operations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Compliance and regulatory affairs</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Authorization */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Authorization</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Carson Rios is an authorized representative of HyveWyre with the authority to act on behalf of the company in operational matters.
              </p>
              <div className="bg-sky-100 dark:bg-sky-900/20 border border-sky-700/50 rounded-lg p-3">
                <p className="text-sm text-sky-600 font-medium">
                  ✓ Verified Authorized Representative
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-800/50 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6 text-sky-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Contact</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-3">
                For operational inquiries or matters requiring authorized representation
              </p>
              <a
                href="mailto:operations@hyvewyre.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Mail className="h-4 w-4" />
                operations@hyvewyre.com
              </a>
            </div>
          </div>
        </div>

        {/* Company Information */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Company</h3>
              <div className="text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-medium text-slate-900 dark:text-slate-100">HyveWyre</p>
                <p>12325 Magnolia Street</p>
                <p>San Antonio, Florida 33576</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Back to Contact */}
      <div className="card bg-blue-100 dark:bg-blue-900/20 border-sky-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Need to get in touch?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Visit our contact page for more ways to reach the HyveWyre team
            </p>
          </div>
          <a
            href="/contact"
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}

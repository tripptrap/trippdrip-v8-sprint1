'use client';

import { Mail, MapPin, Shield, Briefcase, Code } from 'lucide-react';

export default function TrippBrowningPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start gap-6">
          {/* Profile Image Placeholder */}
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-sky-400 to-sky-400 flex items-center justify-center flex-shrink-0">
            <span className="text-5xl font-bold text-gray-900">TB</span>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Tripp Browning</h1>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="px-3 py-1 bg-sky-800/60 border border-sky-600 text-sky-600 rounded-full text-sm font-medium">
                Developer
              </div>
              <div className="px-3 py-1 bg-blue-900/30 border border-sky-700 text-sky-600 rounded-full text-sm font-medium">
                Authorized Representative
              </div>
              <div className="px-3 py-1 bg-sky-900/30 border border-sky-700 text-sky-600 rounded-full text-sm font-medium">
                Technical Lead
              </div>
            </div>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              Developer & Authorized Representative for HyveWyre
            </p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Role & Responsibilities */}
        <div className="card">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-800/50 flex items-center justify-center flex-shrink-0">
              <Code className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Role</h3>
              <p className="text-slate-600 dark:text-slate-400">
                Developer & Authorized Representative for HyveWyre
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Responsibilities</h4>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Platform development and technical architecture</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Authorized representative for company operations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Product innovation and feature development</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-600 mt-1">•</span>
                <span>Technical strategy and system design</span>
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
                Tripp Browning is an authorized representative of HyveWyre with the authority to act on behalf of the company in technical and operational matters.
              </p>
              <div className="bg-sky-100 dark:bg-sky-900/20 border border-sky-700/50 rounded-lg p-3">
                <p className="text-sm text-sky-600 font-medium">
                  ✓ Verified Authorized Representative
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Expertise */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Technical Expertise</h3>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <p className="flex items-start gap-2">
                  <span className="text-sky-600 mt-0.5">→</span>
                  <span>Full-stack development</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-sky-600 mt-0.5">→</span>
                  <span>AI-powered automation systems</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-sky-600 mt-0.5">→</span>
                  <span>SMS/Voice communication platforms</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-sky-600 mt-0.5">→</span>
                  <span>Real-time messaging infrastructure</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6 text-sky-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Contact</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-3">
                For technical inquiries, development matters, or authorized representation
              </p>
              <div className="space-y-2">
                <a
                  href="mailto:tripp@hyvewyre.com"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors text-sm font-medium w-full justify-center"
                >
                  <Mail className="h-4 w-4" />
                  tripp@hyvewyre.com
                </a>
                <a
                  href="mailto:support@hyvewyre.com"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-white/20 text-slate-900 dark:text-slate-100 rounded-lg transition-colors text-sm font-medium w-full justify-center"
                >
                  <Mail className="h-4 w-4" />
                  support@hyvewyre.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Company Information */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-cyan-100 dark:bg-cyan-900/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="h-6 w-6 text-sky-400" />
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

      {/* About HyveWyre */}
      <div className="card bg-sky-100 dark:bg-sky-800/50 border-sky-600/50">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">About HyveWyre</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          HyveWyre is a cutting-edge communication platform that empowers businesses with AI-powered SMS automation,
          conversation flows, and unified messaging capabilities. Built to help insurance agents, real estate professionals,
          and sales teams engage with leads more effectively.
        </p>
        <div className="flex gap-3">
          <a
            href="/contact"
            className="px-4 py-2 bg-sky-500 hover:bg-sky-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Contact Us
          </a>
          <a
            href="/roadmap"
            className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-white/20 text-slate-900 dark:text-slate-100 rounded-lg transition-colors text-sm font-medium"
          >
            View Roadmap
          </a>
        </div>
      </div>
    </div>
  );
}

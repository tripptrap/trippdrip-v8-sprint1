'use client';

import { Mail, MapPin, Phone, MessageSquare } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#e7eef9]">Contact Us</h1>
        <p className="text-[#9fb0c3] mt-1">
          Get in touch with the HyveWyre team
        </p>
      </div>

      {/* Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Operational Address */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Operational Address</h3>
              <div className="text-[#9fb0c3] space-y-1">
                <p className="font-medium text-[#e7eef9]">HyveWyre</p>
                <p>12325 Magnolia Street</p>
                <p>San Antonio, Florida 33576</p>
              </div>
            </div>
          </div>
        </div>

        {/* Email Support */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-green-900/20 flex items-center justify-center flex-shrink-0">
              <Mail className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Email Support</h3>
              <p className="text-[#9fb0c3] mb-3">
                Send us an email and we'll respond within 24 hours
              </p>
              <a
                href="mailto:support@hyvewyre.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Mail className="h-4 w-4" />
                support@hyvewyre.com
              </a>
            </div>
          </div>
        </div>

        {/* Feature Requests */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-900/20 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-6 w-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Feature Requests</h3>
              <p className="text-[#9fb0c3] mb-3">
                Have an idea for a new feature? We'd love to hear it!
              </p>
              <a
                href="mailto:support@hyvewyre.com?subject=Feature Request"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <MessageSquare className="h-4 w-4" />
                Submit Feature Request
              </a>
            </div>
          </div>
        </div>

        {/* Sales & Partnerships */}
        <div className="card">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-900/20 flex items-center justify-center flex-shrink-0">
              <Phone className="h-6 w-6 text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Sales & Partnerships</h3>
              <p className="text-[#9fb0c3] mb-3">
                Interested in enterprise plans or partnerships?
              </p>
              <a
                href="mailto:sales@hyvewyre.com"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Mail className="h-4 w-4" />
                sales@hyvewyre.com
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="card bg-blue-900/20 border-blue-700/50">
        <h3 className="font-semibold text-[#e7eef9] mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/roadmap"
            className="flex items-center gap-2 text-[#9fb0c3] hover:text-blue-400 transition-colors"
          >
            <span>→</span>
            <span>View Product Roadmap</span>
          </a>
          <a
            href="/settings"
            className="flex items-center gap-2 text-[#9fb0c3] hover:text-blue-400 transition-colors"
          >
            <span>→</span>
            <span>Account Settings</span>
          </a>
          <a
            href="https://docs.hyvewyre.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[#9fb0c3] hover:text-blue-400 transition-colors"
          >
            <span>→</span>
            <span>Documentation</span>
          </a>
        </div>
      </div>
    </div>
  );
}

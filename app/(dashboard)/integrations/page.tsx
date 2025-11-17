'use client';

import { useState, useEffect } from 'react';
import { Zap, Calendar, Map, Phone, Mail, Shield, CheckCircle, ExternalLink, Settings, AlertCircle } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: 'data' | 'communication' | 'productivity' | 'compliance';
  icon: any;
  status: 'available' | 'connected' | 'coming_soon';
  features: string[];
  setupUrl?: string;
  docsUrl?: string;
  color: string;
}

const integrations: Integration[] = [
  // Data & Lead Generation
  {
    id: 'google-maps-scraper',
    name: 'Google Maps Scraper',
    description: 'Extract business leads directly from Google Maps with phone numbers, addresses, and business details.',
    category: 'data',
    icon: Map,
    status: 'available',
    features: [
      'Search by location and business type',
      'Extract phone numbers and emails',
      'Get business hours and ratings',
      'Export directly to leads database'
    ],
    setupUrl: '/lead-scraper',
    color: 'text-green-400 bg-green-900/20 border-green-500/30'
  },
  {
    id: 'landline-remover',
    name: 'Landline Remover',
    description: 'Automatically filter out landline numbers from your leads to ensure you only text mobile phones.',
    category: 'data',
    icon: Phone,
    status: 'coming_soon',
    features: [
      'Real-time landline detection',
      'Batch phone number validation',
      'Reduce SMS bounce rates',
      'Save credits on invalid numbers'
    ],
    color: 'text-blue-400 bg-blue-900/20 border-blue-500/30'
  },

  // Communication
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync your availability and automatically schedule calls with leads through SMS conversations.',
    category: 'communication',
    icon: Calendar,
    status: 'available',
    features: [
      'Real-time calendar availability',
      'Automatic appointment booking',
      'Meeting reminders via SMS',
      'Calendar link sharing'
    ],
    setupUrl: '/email',
    docsUrl: 'https://docs.hyvewyre.com/integrations/google-calendar',
    color: 'text-purple-400 bg-purple-900/20 border-purple-500/30'
  },
  {
    id: 'twilio-voice',
    name: 'Twilio Voice',
    description: 'Make and receive phone calls using the same number as your SMS campaigns for unified communication.',
    category: 'communication',
    icon: Phone,
    status: 'coming_soon',
    features: [
      'Unified phone numbers for SMS & calls',
      'Call recording and transcription',
      'Voicemail to SMS notifications',
      'Click-to-call from lead profiles'
    ],
    color: 'text-red-400 bg-red-900/20 border-red-500/30'
  },
  {
    id: 'email-service',
    name: 'Email Integration',
    description: 'Send and receive emails alongside SMS - manage all communication in one unified inbox.',
    category: 'communication',
    icon: Mail,
    status: 'coming_soon',
    features: [
      'Unified inbox for SMS & email',
      'Email templates and campaigns',
      'Track opens and clicks',
      'Automated follow-up sequences'
    ],
    color: 'text-orange-400 bg-orange-900/20 border-orange-500/30'
  },

  // Productivity
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect HyveWyre with 5,000+ apps to automate workflows and sync data across your tools.',
    category: 'productivity',
    icon: Zap,
    status: 'coming_soon',
    features: [
      'Create custom automation workflows',
      'Sync leads with CRM systems',
      'Trigger SMS from other apps',
      'Export data to spreadsheets'
    ],
    docsUrl: 'https://zapier.com',
    color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30'
  },

  // Compliance
  {
    id: 'dnc-list',
    name: 'Enterprise DNC List',
    description: 'Maintain a company-wide Do Not Call list to ensure compliance across all team members.',
    category: 'compliance',
    icon: Shield,
    status: 'coming_soon',
    features: [
      'Centralized do-not-call registry',
      'Automatic filtering before sends',
      'Compliance reporting',
      'TCPA violation prevention'
    ],
    color: 'text-cyan-400 bg-cyan-900/20 border-cyan-500/30'
  },
];

export default function IntegrationsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Integrations' },
    { id: 'data', label: 'Data & Leads' },
    { id: 'communication', label: 'Communication' },
    { id: 'productivity', label: 'Productivity' },
    { id: 'compliance', label: 'Compliance' },
  ];

  const filteredIntegrations = selectedCategory === 'all'
    ? integrations
    : integrations.filter(i => i.category === selectedCategory);

  const statusConfig = {
    available: {
      label: 'Available',
      color: 'text-green-400 bg-green-900/20',
      icon: CheckCircle
    },
    connected: {
      label: 'Connected',
      color: 'text-blue-400 bg-blue-900/20',
      icon: CheckCircle
    },
    coming_soon: {
      label: 'Coming Soon',
      color: 'text-orange-400 bg-orange-900/20',
      icon: AlertCircle
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#e7eef9]">Integrations</h1>
        <p className="text-[#9fb0c3] mt-1">
          Connect HyveWyre with your favorite tools to streamline your workflow and boost productivity.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === category.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-white/5 text-[#9fb0c3] hover:bg-white/10'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-900/20 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">
                {integrations.filter(i => i.status === 'available').length}
              </div>
              <div className="text-sm text-[#9fb0c3]">Available Now</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-900/20 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">
                {integrations.filter(i => i.status === 'coming_soon').length}
              </div>
              <div className="text-sm text-[#9fb0c3]">Coming Soon</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-900/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{integrations.length}</div>
              <div className="text-sm text-[#9fb0c3]">Total Integrations</div>
            </div>
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredIntegrations.map((integration) => {
          const IntegrationIcon = integration.icon;
          const statusInfo = statusConfig[integration.status];
          const StatusIcon = statusInfo.icon;

          return (
            <div
              key={integration.id}
              className={`card border ${integration.color}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-lg ${integration.color} flex items-center justify-center flex-shrink-0`}>
                    <IntegrationIcon className={`h-6 w-6 ${integration.color.split(' ')[0]}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#e7eef9] text-lg">{integration.name}</h3>
                    <div className={`inline-flex items-center gap-1 mt-1 px-2 py-1 rounded text-xs ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-[#9fb0c3] mb-4">{integration.description}</p>

              {/* Features */}
              <div className="space-y-2 mb-4">
                {integration.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-[#9fb0c3]">
                    <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                {integration.status === 'available' && integration.setupUrl && (
                  <a
                    href={integration.setupUrl}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium text-center flex items-center justify-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Setup
                  </a>
                )}
                {integration.status === 'coming_soon' && (
                  <button
                    disabled
                    className="flex-1 px-4 py-2 bg-white/5 text-[#9fb0c3] rounded-lg text-sm font-medium cursor-not-allowed"
                  >
                    Coming Soon
                  </button>
                )}
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[#9fb0c3] rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Docs
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredIntegrations.length === 0 && (
        <div className="card text-center py-12">
          <AlertCircle className="h-12 w-12 text-[#9fb0c3] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">No integrations found</h3>
          <p className="text-[#9fb0c3]">Try selecting a different category</p>
        </div>
      )}

      {/* Feature Request Section */}
      <div className="card bg-blue-900/20 border-blue-700/50">
        <h3 className="font-semibold mb-2 text-[#e7eef9] flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-400" />
          Need a Specific Integration?
        </h3>
        <p className="text-sm text-[#9fb0c3] mb-4">
          We're always looking to add integrations that help you work more efficiently. Let us know which tools you'd like to see integrated with HyveWyre!
        </p>
        <a
          href="mailto:support@hyvewyre.com?subject=Integration Request"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
        >
          <Mail className="h-4 w-4" />
          Request Integration
        </a>
      </div>
    </div>
  );
}

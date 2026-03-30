'use client';

import { useState } from 'react';
import { Calendar, CheckCircle, ExternalLink, Settings, AlertCircle, Zap, Mail } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: any;
  status: 'available' | 'connected';
  features: string[];
  setupUrl?: string;
  docsUrl?: string;
  color: string;
}

const integrations: Integration[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync your availability and automatically schedule calls with leads through SMS conversations.',
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
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-800/50 border-sky-400/30'
  },
];

export default function IntegrationsPage() {
  const statusConfig = {
    available: {
      label: 'Available',
      color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20',
      icon: CheckCircle
    },
    connected: {
      label: 'Connected',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20',
      icon: CheckCircle
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Integrations</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Connect HyveWyre with your favorite tools to streamline your workflow and boost productivity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {integrations.filter(i => i.status === 'available').length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Available Now</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {integrations.filter(i => i.status === 'connected').length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Connected</div>
            </div>
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => {
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
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{integration.name}</h3>
                    <div className={`inline-flex items-center gap-1 mt-1 px-2 py-1 rounded text-xs ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{integration.description}</p>

              {/* Features */}
              <div className="space-y-2 mb-4">
                {integration.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <CheckCircle className="h-4 w-4 text-sky-600 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                {integration.status === 'available' && integration.setupUrl && (
                  <a
                    href={integration.setupUrl}
                    className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm font-medium text-center flex items-center justify-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Setup
                  </a>
                )}
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
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

      {/* Feature Request Section */}
      <div className="card bg-blue-100 dark:bg-blue-900/20 border-sky-700/50">
        <h3 className="font-semibold mb-2 text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Zap className="h-5 w-5 text-sky-600" />
          Need a Specific Integration?
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          We're always looking to add integrations that help you work more efficiently. Let us know which tools you'd like to see integrated with HyveWyre!
        </p>
        <a
          href="mailto:support@hyvewyre.com?subject=Integration Request"
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm"
        >
          <Mail className="h-4 w-4" />
          Request Integration
        </a>
      </div>
    </div>
  );
}

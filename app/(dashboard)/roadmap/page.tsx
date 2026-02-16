'use client';

import { Zap, Mail, Gift, Lock, Smartphone, Globe, Palette, UserCog } from 'lucide-react';

type RoadmapStatus = 'future';

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  category: 'features' | 'integrations' | 'compliance' | 'analytics' | 'platform';
  quarter?: string;
  icon: any;
}

const roadmapItems: RoadmapItem[] = [
  // Post-Launch / Future
  {
    id: 'native-mobile-apps',
    title: 'Native Mobile Apps',
    description: 'iOS and Android apps for managing leads, conversations, and campaigns on the go with push notifications.',
    status: 'future',
    category: 'platform',
    quarter: 'Q3 2026',
    icon: Smartphone
  },
  {
    id: 'browser-extension',
    title: 'Browser Extension',
    description: 'Chrome and Firefox extensions for quick lead capture, message sending, and CRM integration from any webpage.',
    status: 'future',
    category: 'platform',
    quarter: 'Q3 2026',
    icon: Globe
  },
  {
    id: 'branded-opt-in',
    title: 'Branded Opt-In Pages',
    description: 'Create custom-branded SMS opt-in landing pages with your logo, colors, and messaging for lead capture.',
    status: 'future',
    category: 'features',
    quarter: 'Q4 2026',
    icon: Palette
  },
  {
    id: 'team-roles',
    title: 'Team Roles & Permissions',
    description: 'Invite team members with customizable roles - Admin, Manager, Agent - with granular permission controls.',
    status: 'future',
    category: 'features',
    quarter: 'Q4 2026',
    icon: UserCog
  },
];

export default function RoadmapPage() {
  const statusConfig = {
    future: {
      label: 'Coming Soon',
      color: 'text-teal-700',
      bgColor: 'bg-white',
      borderColor: 'border-slate-200 dark:border-slate-700',
      icon: Gift
    }
  };

  const categoryConfig = {
    features: { label: 'Features', color: 'text-sky-600' },
    integrations: { label: 'Integrations', color: 'text-sky-600' },
    compliance: { label: 'Compliance', color: 'text-sky-600' },
    analytics: { label: 'Analytics', color: 'text-sky-600' },
    platform: { label: 'Platform', color: 'text-teal-600' }
  };

  const groupedItems = {
    future: roadmapItems.filter(item => item.status === 'future')
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-white">Product Roadmap</h1>
        <p className="text-slate-700 dark:text-slate-300 mt-1">
          See what we're building and what's coming next. Your feedback shapes our roadmap!
        </p>
      </div>

      {/* Referral Program Section */}
      <div className="card bg-white border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center">
              <Lock className="h-8 w-8 text-sky-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-black dark:text-white mb-1">Referral Program</h2>
              <p className="text-slate-700 dark:text-slate-300">
                Earn 1 month of free premium for each successful referral
              </p>
              <div className="flex items-center gap-2 text-sm text-sky-600 mt-2">
                <Gift className="h-4 w-4" />
                <span className="font-medium">Coming Soon!</span>
              </div>
            </div>
          </div>
          <div className="text-center md:text-right">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center mb-1 mx-auto">
                  <span className="text-sm font-bold text-white">1</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">Share Link</p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center mb-1 mx-auto">
                  <span className="text-sm font-bold text-white">2</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">They Sign Up</p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center mb-1 mx-auto">
                  <span className="text-sm font-bold text-white">3</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">Get Reward</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="card bg-white border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
            <Gift className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <div className="text-2xl font-bold text-teal-700">{groupedItems.future.length}</div>
            <div className="text-sm text-slate-700 dark:text-slate-300">Upcoming Features</div>
          </div>
        </div>
      </div>

      {/* Roadmap Sections */}
      {(['future'] as RoadmapStatus[]).map((status) => {
        const config = statusConfig[status];
        const StatusIcon = config.icon;
        const items = groupedItems[status];

        if (items.length === 0) return null;

        return (
          <div key={status} className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-6 w-6 ${config.color}`} />
              <h2 className={`text-xl font-semibold ${config.color}`}>{config.label}</h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">({items.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => {
                const ItemIcon = item.icon;
                const categoryInfo = categoryConfig[item.category];

                return (
                  <div
                    key={item.id}
                    className={`card ${config.bgColor} border ${config.borderColor} shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0`}>
                        <ItemIcon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-black dark:text-white">{item.title}</h3>
                          {item.quarter && (
                            <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {item.quarter}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">{item.description}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded bg-sky-50 text-sky-700`}>
                            {categoryInfo.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Feedback Section */}
      <div className="card bg-sky-50 border border-sky-200">
        <h3 className="font-semibold mb-2 text-black dark:text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-sky-700" />
          Have a Feature Request?
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
          We'd love to hear your ideas! Your feedback directly influences what we build next. Reach out to us with suggestions, improvements, or new feature ideas.
        </p>
        <a
          href="mailto:support@hyvewyre.com?subject=Feature Request"
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm"
        >
          <Mail className="h-4 w-4" />
          Send Feedback
        </a>
      </div>
    </div>
  );
}

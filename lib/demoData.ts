// Demo Mode Sample Data Generator
// This file generates realistic sample data for demo mode

export const DEMO_LEADS = [
  {
    id: 'demo-lead-1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@email.com',
    phone: '+1234567890',
    status: 'new',
    disposition: 'interested',
    priority: 'high',
    tags: ['Health Insurance', 'Family Plan'],
    notes: 'Interested in family health insurance plan. Has 2 kids.',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-2',
    name: 'Michael Chen',
    email: 'michael.chen@email.com',
    phone: '+1234567891',
    status: 'contacted',
    disposition: 'qualified',
    priority: 'high',
    tags: ['Auto Insurance', 'Hot Lead'],
    notes: 'Ready to switch auto insurance. Current policy expires next month.',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-3',
    name: 'Emily Rodriguez',
    email: 'emily.r@email.com',
    phone: '+1234567892',
    status: 'qualified',
    disposition: 'interested',
    priority: 'medium',
    tags: ['Life Insurance'],
    notes: 'Looking for term life insurance, 30-year policy.',
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-4',
    name: 'David Thompson',
    email: 'david.t@email.com',
    phone: '+1234567893',
    status: 'nurturing',
    disposition: 'not_interested',
    priority: 'low',
    tags: ['Home Insurance'],
    notes: 'Not ready yet, follow up in 3 months.',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-5',
    name: 'Jennifer Martinez',
    email: 'jennifer.m@email.com',
    phone: '+1234567894',
    status: 'contacted',
    disposition: 'callback_scheduled',
    priority: 'high',
    tags: ['Business Insurance', 'Commercial'],
    notes: 'Small business owner, needs general liability coverage.',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-6',
    name: 'Robert Williams',
    email: 'robert.w@email.com',
    phone: '+1234567895',
    status: 'new',
    disposition: null,
    priority: 'medium',
    tags: ['Auto Insurance'],
    notes: 'Inbound lead from website form.',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: null,
  },
  {
    id: 'demo-lead-7',
    name: 'Lisa Anderson',
    email: 'lisa.a@email.com',
    phone: '+1234567896',
    status: 'qualified',
    disposition: 'interested',
    priority: 'high',
    tags: ['Health Insurance', 'Individual Plan'],
    notes: 'Self-employed, looking for affordable health insurance.',
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-8',
    name: 'James Brown',
    email: 'james.b@email.com',
    phone: '+1234567897',
    status: 'converted',
    disposition: 'closed_won',
    priority: 'low',
    tags: ['Auto Insurance', 'Closed'],
    notes: 'Purchased full coverage auto insurance policy.',
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    last_contacted: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_CONVERSATIONS = [
  {
    id: 'demo-thread-1',
    lead_id: 'demo-lead-1',
    lead_name: 'Sarah Johnson',
    messages: [
      {
        id: 'demo-msg-1',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        body: 'Hi, I saw your ad about family health insurance. Can you tell me more?',
        status: 'delivered',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-2',
        direction: 'outbound' as const,
        sender: 'agent',
        recipient: 'lead',
        status: 'delivered',
        body: 'Hi Sarah! Thanks for reaching out. We have excellent family plans that cover medical, dental, and vision. How many people would you need to cover?',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 300000).toISOString(),
      },
      {
        id: 'demo-msg-3',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: 'It would be for myself, my husband, and our 2 kids (ages 8 and 5).',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 600000).toISOString(),
      },
      {
        id: 'demo-msg-4',
        direction: 'outbound' as const,
        sender: 'agent',
        recipient: 'lead',
        status: 'delivered',
        body: 'Perfect! For a family of 4, our Premium Family Plan would be ideal. It includes $0 copays for preventive care and a $2,000 family deductible. Can I send you a detailed quote?',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-5',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: 'Yes please! That sounds great.',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 180000).toISOString(),
      },
    ],
  },
  {
    id: 'demo-thread-2',
    lead_id: 'demo-lead-2',
    lead_name: 'Michael Chen',
    messages: [
      {
        id: 'demo-msg-6',
        direction: 'outbound' as const,
        sender: 'agent',
        recipient: 'lead',
        status: 'delivered',
        body: 'Hi Michael! I see you requested an auto insurance quote. What type of vehicle do you drive?',
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-7',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: '2022 Honda Accord. My current policy is way too expensive.',
        created_at: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-8',
        direction: 'outbound' as const,
        sender: 'agent',
        recipient: 'lead',
        status: 'delivered',
        body: 'Great choice of vehicle! We can definitely help you save. What\'s your current monthly premium?',
        created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-9',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: '$245/month for full coverage',
        created_at: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 'demo-thread-3',
    lead_id: 'demo-lead-3',
    lead_name: 'Emily Rodriguez',
    messages: [
      {
        id: 'demo-msg-10',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: 'I need life insurance. What are my options?',
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-11',
        direction: 'outbound' as const,
        sender: 'agent',
        recipient: 'lead',
        status: 'delivered',
        body: 'Hi Emily! We offer both term and whole life insurance. Term life is more affordable and covers you for a specific period (10, 20, or 30 years). Which sounds better for you?',
        created_at: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-msg-12',
        direction: 'inbound' as const,
        sender: 'lead',
        recipient: 'agent',
        status: 'delivered',
        body: 'I think 30-year term would work. I\'m 32 years old.',
        created_at: new Date(Date.now() - 46 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

export const DEMO_CAMPAIGNS = [
  {
    id: 'demo-campaign-1',
    name: 'Health Insurance Follow-up',
    type: 'drip',
    status: 'active',
    message_template: 'Hi {{name}}! Just checking in about your health insurance needs. Do you have any questions?',
    total_sent: 45,
    total_delivered: 43,
    total_responses: 12,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-campaign-2',
    name: 'Auto Insurance Leads',
    type: 'bulk',
    status: 'completed',
    message_template: 'Save up to 30% on auto insurance! Reply YES for a free quote.',
    total_sent: 120,
    total_delivered: 118,
    total_responses: 34,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_FLOWS = [
  {
    id: 'demo-flow-1',
    name: 'Insurance Qualification Flow',
    description: 'Automatically qualifies leads for insurance products',
    steps: [
      {
        id: 'step-1',
        yourMessage: 'Hi {{name}}! Thanks for your interest. What type of insurance are you looking for?',
        responses: [
          { pattern: 'auto', nextStep: 'step-2a', tag: { label: 'Auto Insurance', color: 'blue' } },
          { pattern: 'health', nextStep: 'step-2b', tag: { label: 'Health Insurance', color: 'green' } },
          { pattern: 'life', nextStep: 'step-2c', tag: { label: 'Life Insurance', color: 'purple' } },
          { pattern: 'home', nextStep: 'step-2d', tag: { label: 'Home Insurance', color: 'orange' } },
        ],
      },
      {
        id: 'step-2a',
        yourMessage: 'Great! For auto insurance, what year/make/model is your vehicle?',
        responses: [
          { pattern: '*', nextStep: 'step-3', tag: { label: 'Vehicle Info Collected', color: 'blue' } },
        ],
      },
      {
        id: 'step-2b',
        yourMessage: 'Perfect! Are you looking for individual or family coverage?',
        responses: [
          { pattern: 'individual', nextStep: 'step-3', tag: { label: 'Individual Plan', color: 'green' } },
          { pattern: 'family', nextStep: 'step-3', tag: { label: 'Family Plan', color: 'green' } },
        ],
      },
    ],
    active: true,
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('demo_mode') === 'true';
}

export function enableDemoMode(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('demo_mode', 'true');
  // Reload to apply demo data
  window.location.reload();
}

export function disableDemoMode(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('demo_mode', 'false');
  // Reload to clear demo data
  window.location.reload();
}

export function getDemoLeads() {
  return isDemoMode() ? DEMO_LEADS : [];
}

export function getDemoConversations() {
  return isDemoMode() ? DEMO_CONVERSATIONS : [];
}

export function getDemoCampaigns() {
  return isDemoMode() ? DEMO_CAMPAIGNS : [];
}

export function getDemoFlows() {
  return isDemoMode() ? DEMO_FLOWS : [];
}

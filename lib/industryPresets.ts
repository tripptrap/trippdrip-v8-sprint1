export const INDUSTRY_PRESETS: Record<string, { tags: string[]; campaigns: string[] }> = {
  insurance: {
    tags: ['New Lead', 'Contacted', 'Quoted', 'Under Review', 'Appointment Set', 'Sold', 'Lost'],
    campaigns: ['Health', 'Life', 'Auto', 'Home', 'Commercial'],
  },
  real_estate: {
    tags: ['New Lead', 'Showing Scheduled', 'Offer Made', 'Under Contract', 'Closed', 'Lost'],
    campaigns: ['Buyer', 'Seller', 'Rental', 'Commercial'],
  },
  solar: {
    tags: ['New Lead', 'Site Survey', 'Proposal Sent', 'Contract Signed', 'Installation', 'Complete'],
    campaigns: ['Residential', 'Commercial', 'Battery Storage'],
  },
  roofing: {
    tags: ['New Lead', 'Inspection Scheduled', 'Estimate Sent', 'Approved', 'In Progress', 'Complete'],
    campaigns: ['Residential', 'Commercial', 'Storm Damage', 'Insurance Claim'],
  },
  home_services: {
    tags: ['New Lead', 'Contacted', 'Estimate Sent', 'Scheduled', 'In Progress', 'Complete'],
    campaigns: ['HVAC', 'Plumbing', 'Electrical', 'General'],
  },
  financial_services: {
    tags: ['New Lead', 'Consulted', 'Proposal Sent', 'Under Review', 'Signed', 'Active'],
    campaigns: ['Mortgage', 'Investment', 'Tax', 'Insurance'],
  },
  healthcare: {
    tags: ['New Lead', 'Contacted', 'Appointment Set', 'Consulted', 'Follow-up', 'Active Patient'],
    campaigns: ['General', 'Dental', 'Specialist', 'Wellness'],
  },
  automotive: {
    tags: ['New Lead', 'Test Drive', 'Negotiating', 'Financing', 'Sold', 'Lost'],
    campaigns: ['New Vehicle', 'Used Vehicle', 'Service', 'Parts'],
  },
  retail: {
    tags: ['New Lead', 'Interested', 'Cart Abandoned', 'Purchased', 'Repeat Customer'],
    campaigns: ['Online', 'In-Store', 'Wholesale', 'Seasonal'],
  },
  other: {
    tags: ['New Lead', 'Contacted', 'Qualified', 'Proposal', 'Negotiating', 'Closed', 'Lost'],
    campaigns: ['Inbound', 'Outbound', 'Referral'],
  },
};

// Tag colors for visual distinction in the pipeline
const TAG_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

/**
 * Map an onboarding industry onto Telnyx's 10DLC `vertical` enum (#1).
 *
 * The two vocabularies do not line up one-to-one — solar is ENERGY, roofing and
 * home services are both CONSTRUCTION — and the enum is closed: a value Telnyx
 * does not recognise fails brand creation. The enum values below were confirmed
 * against `GET /v2/10dlc/enum/vertical` and match VERTICAL_OPTIONS in
 * components/settings/TenDLCRegistration.tsx.
 *
 * Falls back to PROFESSIONAL rather than throwing. A slightly generic vertical
 * is a far better outcome than a failed registration, and the user can correct
 * it in Settings before the brand is reviewed.
 */
export const INDUSTRY_TO_VERTICAL: Record<string, string> = {
  insurance: 'INSURANCE',
  real_estate: 'REAL_ESTATE',
  solar: 'ENERGY',
  roofing: 'CONSTRUCTION',
  home_services: 'CONSTRUCTION',
  financial_services: 'FINANCIAL',
  healthcare: 'HEALTHCARE',
  automotive: 'RETAIL',
  retail: 'RETAIL',
  other: 'PROFESSIONAL',
};

export function mapIndustryToVertical(industry?: string): string {
  return INDUSTRY_TO_VERTICAL[industry ?? ''] ?? 'PROFESSIONAL';
}

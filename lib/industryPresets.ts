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

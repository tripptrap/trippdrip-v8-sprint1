// Telnyx 10DLC enums, confirmed against the live API rather than documentation.
//
//   GET https://api.telnyx.com/10dlc/enum/vertical     -> 23 values
//   GET https://api.telnyx.com/10dlc/enum/entityType   -> 5 values
//
// Last verified 2026-08-07. #1 recorded the vertical list as an open question to
// put to Telnyx support; the API answers it directly, which is both faster and
// more authoritative than a support reply.
//
// Why this matters more than a normal enum: a wrong value here is not a 400 from
// our own code, it is a REJECTED CARRIER FILING. Brand registration costs $4.50
// and a campaign review $15, and the review fee recurs on every resubmission. The
// UI has offered a dropdown since 2026-07-27, but the API accepted anything —
// same shape as #174, where the UI constrained a value and the route did not.

/** Every vertical Telnyx accepts, with its own display name. */
export const TELNYX_VERTICALS = {
  AGRICULTURE: 'Agriculture',
  COMMUNICATION: 'Media and Communication',
  CONSTRUCTION: 'Construction, Materials & Trade Services',
  EDUCATION: 'Education',
  ENERGY: 'Energy and Utilities',
  ENTERTAINMENT: 'Entertainment',
  FINANCIAL: 'Financial Services',
  GAMBLING: 'Gambling and Lottery',
  GOVERNMENT: 'Government Services and Agencies',
  HEALTHCARE: 'Healthcare and Life Sciences',
  HOSPITALITY: 'Hospitality and Travel',
  HUMAN_RESOURCES: 'HR, Staffing or Recruitment',
  INSURANCE: 'Insurance',
  LEGAL: 'Legal',
  MANUFACTURING: 'Manufacturing',
  NGO: 'Non-profit Organization',
  POLITICAL: 'Political',
  POSTAL: 'Postal and Delivery',
  PROFESSIONAL: 'Professional Services',
  REAL_ESTATE: 'Real Estate',
  RETAIL: 'Retail and Consumer Products',
  TECHNOLOGY: 'Information Technology Services',
  TRANSPORTATION: 'Transportation or Logistics',
} as const;

export type TelnyxVertical = keyof typeof TELNYX_VERTICALS;

/**
 * Not offered in the signup UI, but still valid at Telnyx.
 *
 * Both carry additional carrier vetting and separate compliance obligations that
 * this product does not currently handle — political messaging in particular has
 * its own registration regime. Anyone genuinely in one of these should be handled
 * deliberately, not by picking it from a dropdown. They remain valid for
 * server-side validation so a manual submission is not blocked.
 */
export const VERTICALS_NOT_SELF_SERVE: readonly TelnyxVertical[] = ['GAMBLING', 'POLITICAL'];

/** Verticals offered in the registration form, in the order shown. */
export const SELF_SERVE_VERTICALS = (Object.keys(TELNYX_VERTICALS) as TelnyxVertical[])
  .filter(v => !VERTICALS_NOT_SELF_SERVE.includes(v));

export const TELNYX_ENTITY_TYPES = [
  'PRIVATE_PROFIT',
  'PUBLIC_PROFIT',
  'NON_PROFIT',
  'GOVERNMENT',
  'SOLE_PROPRIETOR',
] as const;

export type TelnyxEntityType = (typeof TELNYX_ENTITY_TYPES)[number];

export function isValidVertical(v: unknown): v is TelnyxVertical {
  return typeof v === 'string' && v in TELNYX_VERTICALS;
}

export function isValidEntityType(v: unknown): v is TelnyxEntityType {
  return typeof v === 'string' && (TELNYX_ENTITY_TYPES as readonly string[]).includes(v);
}

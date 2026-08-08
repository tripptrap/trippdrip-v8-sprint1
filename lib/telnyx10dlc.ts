// Telnyx 10DLC brand + campaign registration.
//
// Telnyx requires every end-client of an ISV platform to register its own
// brand and campaign — there is no single shared platform-level brand.
// These functions register one HyveWyre agent at a time. Pass `mock: true`
// while testing to use Telnyx's free mock brands/campaigns (no fees, no
// real vetting, not usable for real traffic).

const TELNYX_API_URL = 'https://api.telnyx.com/v2';

function apiKey(): string | null {
  return process.env.TELNYX_API_KEY || null;
}

function errorFromResponse(data: any, fallback: string): string {
  return data?.errors?.[0]?.detail || data?.errors?.[0]?.title || fallback;
}

// ── Brand ────────────────────────────────────────────────────────────────

export type EntityType = 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT' | 'GOVERNMENT' | 'SOLE_PROPRIETOR';

export interface CreateBrandParams {
  entityType: EntityType;
  displayName: string;
  companyName: string;
  /**
   * Sole proprietors DO have one, and Telnyx stores it — verified against a live
   * brand. The IRS issues an EIN to an individual with no company, which is the
   * whole basis of the sole-proprietor path.
   */
  ein?: string;
  phone: string;
  /**
   * SOLE_PROPRIETOR only, and required there — TCR matches a sole proprietor
   * against a person rather than a company.
   *
   * Do not send these for any other entity type. Telnyx accepts them, echoes
   * them back in the create response, and then discards them: a later GET reads
   * null. Confirmed with Telnyx support, who called the silent drop "not ideal
   * from an API design perspective" (#193). The create response is not evidence
   * a brand field persisted.
   */
  firstName?: string;
  lastName?: string;
  /** Receives the sole-proprietor OTP PIN. Must be SMS-capable. */
  mobilePhone?: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  website?: string;
  vertical: string;
  mock?: boolean;
}

export interface BrandResult {
  success: boolean;
  brandId?: string;
  status?: string;
  error?: string;
}

export async function createBrand(params: CreateBrandParams): Promise<BrandResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const requestBody: Record<string, any> = {
      entityType: params.entityType,
      displayName: params.displayName,
      companyName: params.companyName,
      phone: params.phone,
      street: params.street,
      city: params.city,
      state: params.state,
      postalCode: params.postalCode,
      country: params.country,
      email: params.email,
      vertical: params.vertical,
    };

    if (params.ein) requestBody.ein = params.ein;
    if (params.website) requestBody.website = params.website;
    if (params.mock) requestBody.mock = true;

    // Gated on the entity type rather than merely "if supplied". Sending these
    // for a PRIVATE_PROFIT brand is not harmless-but-ignored from our side: it
    // makes the request look like it carried a name TCR will match on, and the
    // discard is invisible until a GET (#193). Only send them where they mean
    // something.
    if (params.entityType === 'SOLE_PROPRIETOR') {
      if (params.firstName) requestBody.firstName = params.firstName;
      if (params.lastName) requestBody.lastName = params.lastName;
      if (params.mobilePhone) requestBody.mobilePhone = params.mobilePhone;
    }

    const response = await fetch(`${TELNYX_API_URL}/10dlc/brand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx createBrand error:', data);
      return { success: false, error: errorFromResponse(data, 'Failed to create brand') };
    }

    // identityStatus is the real vetting status (VERIFIED/FAILED/etc) but is
    // null immediately after creation — status carries REGISTRATION_PENDING
    // at that point instead. On later GETs, status is just a generic "OK"
    // API-result flag and identityStatus holds the real value.
    return {
      success: true,
      brandId: data.data?.brandId ?? data.brandId,
      status: data.data?.identityStatus ?? data.identityStatus ?? data.data?.status ?? data.status,
    };
  } catch (error: any) {
    console.error('Telnyx createBrand error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Force a simulated identity outcome on MOCK brands only (#191).
 *
 * Telnyx auto-verifies mock `PRIVATE_PROFIT` brands. That is convenient and it
 * is also the problem: identity matching is the single most likely thing to fail
 * for a real customer, and it is stubbed to always pass on the one entity type
 * customers actually register as. Every mock run reported success; the first real
 * non-LLC registration came back UNVERIFIED with no carrier qualifying it (#193).
 * So mock could not exercise the dead-end path at all — the branch that decides
 * what a stuck user is told had no way to be reached in testing.
 *
 * Set TELNYX_10DLC_MOCK_IDENTITY to UNVERIFIED / FAILED / VERIFIED to simulate
 * that outcome. Mock SOLE_PROPRIETOR brands already return UNVERIFIED honestly,
 * so this exists for the types that do not.
 *
 * Two independent guards, because getting this wrong in production would mean
 * telling a paying customer their verified brand had failed:
 *   1. TELNYX_10DLC_MOCK must be 'true' — environment only, never a request body;
 *   2. the brand itself must report `mock: true` from Telnyx.
 * Neither alone is enough. A stale env var cannot touch a real brand, and a mock
 * brand is untouched unless mock mode is deliberately on.
 */
function simulatedIdentityStatus(brandIsMock: boolean): string | null {
  if (process.env.TELNYX_10DLC_MOCK?.trim() !== 'true') return null;
  if (!brandIsMock) return null;

  const forced = process.env.TELNYX_10DLC_MOCK_IDENTITY?.trim().toUpperCase();
  if (!forced) return null;
  if (!['VERIFIED', 'UNVERIFIED', 'FAILED'].includes(forced)) {
    console.warn(`TELNYX_10DLC_MOCK_IDENTITY="${forced}" is not VERIFIED, UNVERIFIED or FAILED — ignoring`);
    return null;
  }
  return forced;
}

export async function getBrandStatus(brandId: string): Promise<BrandResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const response = await fetch(`${TELNYX_API_URL}/10dlc/brand/${brandId}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: errorFromResponse(data, 'Failed to fetch brand status') };
    }

    const real = data.data?.identityStatus ?? data.identityStatus ?? data.data?.status ?? data.status;
    const simulated = simulatedIdentityStatus((data.data?.mock ?? data.mock) === true);
    if (simulated) {
      console.warn(`⚠️ 10DLC MOCK: reporting brand ${brandId} as ${simulated} (Telnyx says ${real})`);
    }

    return { success: true, brandId, status: simulated ?? real };
  } catch (error: any) {
    console.error('Telnyx getBrandStatus error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// ── Campaign ─────────────────────────────────────────────────────────────

// Confirmed against Telnyx's live API (2026-07-26): the enum value is
// LOW_VOLUME, not LOW_VOLUME_MIXED — "Low Volume Mixed" in Telnyx's support
// docs describes a configuration (LOW_VOLUME usecase + multiple subUsecases),
// not a distinct API value. LOW_VOLUME does accept subUsecases.
export type CampaignUseCase = 'LOW_VOLUME' | 'MIXED';

export interface CreateCampaignParams {
  brandId: string;
  usecase: CampaignUseCase;
  subUsecases?: string[];
  description: string;
  sample1: string;
  sample2: string;
  sample3?: string;
  messageFlow: string;
  helpMessage: string;
  optinMessage: string;
  optoutMessage: string;
  optinKeywords: string;
  optoutKeywords: string;
  helpKeywords: string;
  subscriberOptin: boolean;
  subscriberOptout: boolean;
  subscriberHelp: boolean;
  numberPool: boolean;
  embeddedLink: boolean;
  embeddedLinkSample?: string;
  embeddedPhone: boolean;
  ageGated: boolean;
  directLending: boolean;
  privacyPolicyLink?: string;
  termsAndConditionsLink?: string;
  mock?: boolean;
}

export interface CampaignResult {
  success: boolean;
  campaignId?: string;
  status?: string;
  /** Telnyx's `status` field (ACTIVE / EXPIRED / …), distinct from `campaignStatus`. */
  lifecycleStatus?: string;
  failureReasons?: string[];
  error?: string;
}

/**
 * Map Telnyx brand state onto the three values `user_10dlc_registrations.brand_status`
 * holds. Fed `identityStatus` (VERIFIED / UNVERIFIED / VETTED_VERIFIED / FAILED).
 */
export function mapBrandStatus(raw?: string): 'pending' | 'unverified' | 'verified' | 'failed' {
  const s = (raw || '').toUpperCase();
  // Exact match, not `includes('VERIFIED')` — that substring is also inside
  // **UNVERIFIED**, so a brand that failed identity verification was being
  // recorded as verified, and the app would go on to create a campaign and
  // attach numbers as though the brand were good.
  if (s === 'VERIFIED' || s === 'VETTED_VERIFIED') return 'verified';
  if (s.includes('FAILED')) return 'failed';

  // UNVERIFIED is its own outcome, not a stage on the way to one (#190).
  //
  // It used to fall through to `pending`, which reads as "TCR is still looking".
  // It is the opposite: TCR looked and could not match the business. Folding the
  // two together meant the campaign gate never opened, the cron re-checked
  // forever, and the user kept being told to expect it "in a few days" — an ETA
  // that could not arrive, because nothing was in flight.
  //
  // What clears it depends entirely on entity type, so callers must branch on
  // that rather than on this value alone:
  //   SOLE_PROPRIETOR — expected. Clears when the user completes the manual OTP.
  //   everything else — TCR could not match the name/EIN. Needs IRS propagation,
  //                     paid external vetting, or a NEW brand: companyName and
  //                     ein are immutable once TCR holds them.
  if (s === 'UNVERIFIED') return 'unverified';

  return 'pending';
}

/**
 * Map Telnyx campaign state onto `user_10dlc_registrations.campaign_status`.
 *
 * ── Why this is not a one-liner (#1) ────────────────────────────────────────
 *
 * There are **two** status fields on a Telnyx campaign and they use different
 * vocabularies:
 *
 *   status         ACTIVE | EXPIRED | …
 *   campaignStatus TCR_PENDING | TCR_EXPIRED | MNO_PENDING | MNO_PROVISIONED | …
 *
 * `getCampaignStatus` returns `campaignStatus`, but both callers mapped it with
 * `if (s === 'ACTIVE')` — a value that field never takes. So an **approved,
 * MNO-provisioned campaign fell through to 'pending'**, and stayed there
 * forever. That is not cosmetic: `autoAssignNumberToCampaign` refuses to attach
 * a number unless the stored status is active/approved/mno_provisioned, and the
 * refresh route only auto-assigns on the pending→active transition. Neither
 * could ever fire, which is why the approved campaign had **0 numbers assigned**
 * while every other diagnostic said it was healthy.
 *
 * `EXPIRED` is deliberately terminal rather than 'pending'. Treating it as
 * pending is what left the app polling a dead campaign indefinitely — the
 * stored id pointed at a TCR_EXPIRED campaign and every refresh happily
 * rewrote 'pending' over 'pending'.
 *
 * Accepts either field, so a caller passing `status` still behaves.
 */
export function mapCampaignStatus(raw?: string): 'pending' | 'active' | 'failed' {
  const s = (raw || '').toUpperCase();
  if (!s) return 'pending';
  // Usable: carriers have provisioned it, or the lifecycle field says ACTIVE.
  if (s === 'ACTIVE' || s.includes('PROVISIONED')) return 'active';
  // Terminal. EXPIRED and SUSPENDED are not recoverable by waiting.
  if (s.includes('FAILED') || s.includes('REJECTED') || s.includes('EXPIRED') || s.includes('SUSPENDED')) {
    return 'failed';
  }
  return 'pending';
}

/**
 * Per-field length limits Telnyx enforces on campaign creation, confirmed
 * against the live API by submitting deliberately out-of-range values and
 * reading the `source.pointer` it returns (#1).
 *
 * Checked before the request because of the order things happen in: the brand
 * is created and **charged** first, then the campaign. A field that overflows
 * fails at the campaign step with an opaque `10025 String length out of range`,
 * after the money is gone. Catching it here names the field and costs nothing.
 *
 * Deliberately not listed: `messageFlow`. It has no 320 cap — the approved
 * campaign's is 944 characters — and guessing a limit that does not exist would
 * reject valid submissions.
 */
const CAMPAIGN_FIELD_LIMITS: { field: keyof CreateCampaignParams; min?: number; max?: number }[] = [
  { field: 'optinMessage', min: 20, max: 320 },
  { field: 'optoutMessage', min: 20, max: 320 },
  { field: 'helpMessage', min: 20, max: 320 },
  { field: 'sample1', min: 20 },
  { field: 'sample2', min: 20 },
  { field: 'description', min: 40 },
];

export function validateCampaignFields(params: CreateCampaignParams): string | null {
  for (const { field, min, max } of CAMPAIGN_FIELD_LIMITS) {
    const value = params[field];
    if (typeof value !== 'string') continue;
    if (max !== undefined && value.length > max) {
      return `${field} is ${value.length} characters; Telnyx allows at most ${max}`;
    }
    if (min !== undefined && value.length < min) {
      return `${field} is ${value.length} characters; Telnyx requires at least ${min}`;
    }
  }
  return null;
}

export interface CampaignQualification {
  /** False only when Telnyx answered and no carrier will take the campaign. */
  qualifies: boolean;
  /** Carrier name → whether it will accept this brand on this use case. */
  carriers: Record<string, boolean>;
  /** Carriers that said no. Empty when everything qualifies. */
  declined: string[];
  quarterlyFee?: number;
  annualFee?: number;
  monthlyFee?: number;
  /** Set when the check itself could not be completed. */
  error?: string;
}

/**
 * Ask Telnyx whether a brand can actually run this use case, before paying to
 * find out.
 *
 * `GET /10dlc/campaignBuilder/brand/{id}/usecase/{uc}` is **free** and returns a
 * per-carrier `qualify` flag alongside the fee schedule. Nothing called it, so
 * the only way to learn a campaign was unrunnable was to submit one and be
 * charged — and the campaign review fee recurs on every resubmission, with
 * docs/10DLC_REJECTION_HISTORY.md recording eight submissions before one passed.
 *
 * It is decisive in practice. Checked on 2026-08-07:
 *   verified brand   → qualify true at all seven carriers
 *   UNVERIFIED brand → qualify FALSE at all seven
 *
 * A failed *check* is not a failed qualification. If Telnyx cannot be reached the
 * result carries `error` and `qualifies: true`, so an outage never blocks a
 * registration that would have succeeded — the caller decides what that is worth.
 */
export async function checkCampaignQualification(
  brandId: string,
  usecase: string
): Promise<CampaignQualification> {
  const key = apiKey();
  if (!key) return { qualifies: true, carriers: {}, declined: [], error: 'Telnyx API key not configured' };

  try {
    // A simulated-unverified brand must also stop qualifying, or the simulation
    // contradicts itself: the sync would see `unverified` and skip, while this
    // reported every carrier happy. Telnyx answers for the brand it actually
    // holds, so the override has to be mirrored here (#191).
    //
    // Guarded the same way as the status override — mock mode on AND the brand
    // itself mock — so this cannot decline a real brand.
    const forced = process.env.TELNYX_10DLC_MOCK?.trim() === 'true'
      ? process.env.TELNYX_10DLC_MOCK_IDENTITY?.trim().toUpperCase()
      : undefined;
    if (forced === 'UNVERIFIED' || forced === 'FAILED') {
      const brandRes = await fetch(`${TELNYX_API_URL}/10dlc/brand/${encodeURIComponent(brandId)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const brand = await brandRes.json().catch(() => ({}));
      if ((brand?.data?.mock ?? brand?.mock) === true) {
        const carriers = {
          'AT&T': false, 'T-Mobile': false, 'Verizon Wireless': false,
          'US Cellular': false, 'Interop': false, 'ClearSky': false, 'Liberty': false,
        };
        console.warn(`⚠️ 10DLC MOCK: reporting no carrier qualification for mock brand ${brandId}`);
        return { qualifies: false, carriers, declined: Object.keys(carriers) };
      }
    }

    const res = await fetch(
      `${TELNYX_API_URL}/10dlc/campaignBuilder/brand/${encodeURIComponent(brandId)}/usecase/${encodeURIComponent(usecase)}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();

    if (!res.ok) {
      return {
        qualifies: true, carriers: {}, declined: [],
        error: errorFromResponse(data, `qualification check returned HTTP ${res.status}`),
      };
    }

    const carriers: Record<string, boolean> = {};
    for (const entry of Object.values(data?.mnoMetadata ?? {}) as any[]) {
      if (entry?.mno) carriers[entry.mno] = entry.qualify === true;
    }

    // An empty carrier map means Telnyx told us nothing useful. Treated as
    // "cannot tell" rather than "nobody qualifies" — refusing on silence would
    // block registrations over a response-shape change.
    if (Object.keys(carriers).length === 0) {
      return { qualifies: true, carriers: {}, declined: [], error: 'no carrier data in response' };
    }

    const declined = Object.entries(carriers).filter(([, ok]) => !ok).map(([mno]) => mno);
    return {
      qualifies: declined.length < Object.keys(carriers).length,
      carriers,
      declined,
      quarterlyFee: data?.quarterlyFee,
      annualFee: data?.annualFee,
      monthlyFee: data?.monthlyFee,
    };
  } catch (err: any) {
    return { qualifies: true, carriers: {}, declined: [], error: err?.message || 'qualification check failed' };
  }
}

export async function createCampaign(params: CreateCampaignParams): Promise<CampaignResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  const lengthError = validateCampaignFields(params);
  if (lengthError) {
    console.error('createCampaign: refusing to submit —', lengthError);
    return { success: false, error: lengthError };
  }

  try {
    const requestBody: Record<string, any> = {
      brandId: params.brandId,
      usecase: params.usecase,
      description: params.description,
      sample1: params.sample1,
      sample2: params.sample2,
      messageFlow: params.messageFlow,
      helpMessage: params.helpMessage,
      optinMessage: params.optinMessage,
      optoutMessage: params.optoutMessage,
      optinKeywords: params.optinKeywords,
      optoutKeywords: params.optoutKeywords,
      helpKeywords: params.helpKeywords,
      subscriberOptin: params.subscriberOptin,
      subscriberOptout: params.subscriberOptout,
      subscriberHelp: params.subscriberHelp,
      numberPool: params.numberPool,
      embeddedLink: params.embeddedLink,
      embeddedPhone: params.embeddedPhone,
      ageGated: params.ageGated,
      directLending: params.directLending,
    };

    if (params.subUsecases?.length) requestBody.subUsecases = params.subUsecases;
    if (params.sample3) requestBody.sample3 = params.sample3;
    if (params.embeddedLinkSample) requestBody.embeddedLinkSample = params.embeddedLinkSample;
    if (params.privacyPolicyLink) requestBody.privacyPolicyLink = params.privacyPolicyLink;
    if (params.termsAndConditionsLink) requestBody.termsAndConditionsLink = params.termsAndConditionsLink;
    if (params.mock) requestBody.mock = true;

    const response = await fetch(`${TELNYX_API_URL}/10dlc/campaignBuilder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx createCampaign error:', data);
      return { success: false, error: errorFromResponse(data, 'Failed to create campaign') };
    }

    const campaign = data.data ?? data;

    return {
      success: true,
      campaignId: campaign.campaignId ?? campaign.id,
      status: campaign.campaignStatus,
      failureReasons: campaign.failureReasons?.map((f: any) => f.description).filter(Boolean),
    };
  } catch (error: any) {
    console.error('Telnyx createCampaign error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

export async function getCampaignStatus(campaignId: string): Promise<CampaignResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const response = await fetch(`${TELNYX_API_URL}/10dlc/campaign/${campaignId}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: errorFromResponse(data, 'Failed to fetch campaign status') };
    }

    return {
      success: true,
      campaignId,
      status: data.campaignStatus,
      // Returned alongside so callers can tell a campaign that is merely
      // awaiting review from one that is EXPIRED — `campaignStatus` alone does
      // not always make that obvious (#1).
      lifecycleStatus: data.status,
      failureReasons: data.failureReasons?.map((f: any) => f.description).filter(Boolean),
    };
  } catch (error: any) {
    console.error('Telnyx getCampaignStatus error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

export interface BrandCampaign {
  campaignId: string;
  campaignStatus?: string;
  status?: string;
  usecase?: string;
}

/**
 * List every campaign under a brand.
 *
 * Exists so the app can recover when the campaign id it stored is no longer the
 * one that matters (#1). A campaign can expire, be rejected, or be replaced by a
 * resubmission — and when that happens Telnyx does not update the old id, it
 * issues a new one. The stored pointer keeps resolving (HTTP 200, TCR_EXPIRED),
 * so nothing looks broken from the app's side while every number assignment
 * silently targets a dead campaign.
 *
 * This account reached exactly that state: eight campaigns had been created
 * under one brand over successive rejections, the DB held the id of a superseded
 * one, and the approved campaign had zero numbers attached.
 */
export async function listCampaignsForBrand(
  brandId: string
): Promise<{ success: boolean; campaigns?: BrandCampaign[]; error?: string }> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const response = await fetch(
      `${TELNYX_API_URL}/10dlc/campaign?brandId=${encodeURIComponent(brandId)}&page=1&recordsPerPage=100`,
      { headers: { 'Authorization': `Bearer ${key}` } }
    );
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: errorFromResponse(data, 'Failed to list campaigns') };
    }

    const records = data.records ?? data.data ?? [];
    return {
      success: true,
      campaigns: records.map((r: any) => ({
        campaignId: r.campaignId,
        campaignStatus: r.campaignStatus,
        status: r.status,
        usecase: r.usecase,
      })),
    };
  } catch (error: any) {
    console.error('Telnyx listCampaignsForBrand error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * The campaign under this brand that can actually carry traffic, if any.
 * Returns null rather than guessing when none is provisioned.
 */
export function pickUsableCampaign(campaigns?: BrandCampaign[]): BrandCampaign | null {
  if (!campaigns?.length) return null;
  return campaigns.find(c => mapCampaignStatus(c.campaignStatus ?? c.status) === 'active') ?? null;
}

// ── Phone number assignment ─────────────────────────────────────────────

export interface AssignNumberResult {
  success: boolean;
  error?: string;
}

/**
 * Links an approved campaign to a phone number. The number must already be
 * assigned to a Telnyx messaging profile, and the campaign must be ACTIVE.
 */
export async function assignNumberToCampaign(phoneNumber: string, campaignId: string): Promise<AssignNumberResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const response = await fetch(`${TELNYX_API_URL}/10dlc/phoneNumberCampaign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ phoneNumber, campaignId }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx assignNumberToCampaign error:', data);
      return { success: false, error: errorFromResponse(data, 'Failed to assign number to campaign') };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Telnyx assignNumberToCampaign error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// ── Test-only cleanup ────────────────────────────────────────────────────

/** Deletes a brand. Used to clean up mock brands created during integration testing. */
export async function deleteBrand(brandId: string): Promise<{ success: boolean; error?: string }> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

  try {
    const response = await fetch(`${TELNYX_API_URL}/10dlc/brand/${brandId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${key}` },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: errorFromResponse(data, 'Failed to delete brand') };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Is this campaign approved far enough to attach a number and send?
 *
 * The one definition of "usable", because there were three and one of them was
 * wrong. See the vocabulary note above: `campaignStatus` never takes the value
 * `ACTIVE`, so `assign-number` comparing against it refused every campaign,
 * including a fully approved MNO_PROVISIONED one — the button told the user to
 * "check back once Telnyx approves it" about a campaign Telnyx had approved.
 *
 * `autoAssignCampaignNumber` had already been fixed with a local list; that list
 * moved here rather than being copied a third time.
 *
 * Accepts either status field and is case-insensitive, since the two vocabularies
 * differ in case as well as in value.
 */
export function isCampaignUsable(status: string | null | undefined): boolean {
  if (!status) return false;
  return ['active', 'approved', 'mno_provisioned'].includes(status.trim().toLowerCase());
}

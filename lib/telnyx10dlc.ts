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
  ein?: string; // omitted for SOLE_PROPRIETOR
  phone: string;
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

    return {
      success: true,
      brandId,
      status: data.data?.identityStatus ?? data.identityStatus ?? data.data?.status ?? data.status,
    };
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
  failureReasons?: string[];
  error?: string;
}

export async function createCampaign(params: CreateCampaignParams): Promise<CampaignResult> {
  const key = apiKey();
  if (!key) return { success: false, error: 'Telnyx API key not configured' };

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
      failureReasons: data.failureReasons?.map((f: any) => f.description).filter(Boolean),
    };
  } catch (error: any) {
    console.error('Telnyx getCampaignStatus error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
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

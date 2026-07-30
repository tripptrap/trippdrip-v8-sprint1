// Telnyx utility functions for sending SMS/MMS

const TELNYX_API_URL = 'https://api.telnyx.com/v2';

interface SendTelnyxSMSOptions {
  to: string;
  message: string;
  from?: string;
  mediaUrls?: string[];
}

interface TelnyxSMSResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  error?: string;
  from?: string;
}

export async function sendTelnyxSMS(options: SendTelnyxSMSOptions): Promise<TelnyxSMSResult> {
  const { to, message, from, mediaUrls } = options;

  const apiKey = process.env.TELNYX_API_KEY;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey) {
    return { success: false, error: 'Telnyx API key not configured' };
  }

  if (!messagingProfileId) {
    return { success: false, error: 'Telnyx messaging profile ID not configured' };
  }

  try {
    // When we have a specific 'from' number, send it directly without messaging_profile_id.
    // Including messaging_profile_id with 'from' causes Telnyx to validate against the
    // number pool, which fails if Number Pool isn't enabled on the profile.
    const requestBody: any = {
      to,
      text: message,
    };

    if (from) {
      requestBody.from = from;
    } else {
      requestBody.messaging_profile_id = messagingProfileId;
    }

    // Add media for MMS
    if (mediaUrls && mediaUrls.length > 0) {
      requestBody.media_urls = mediaUrls;
    }

    const response = await fetch(`${TELNYX_API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.errors?.[0]?.detail || data.errors?.[0]?.title || 'Failed to send message';
      console.error('Telnyx API error:', data);
      return { success: false, error: errorMessage };
    }

    return {
      success: true,
      messageSid: data.data?.id,
      status: data.data?.to?.[0]?.status || 'queued',
      from: data.data?.from?.phone_number,
    };
  } catch (error: any) {
    console.error('Telnyx send error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// ── Toll-Free Verification ──────────────────────────────────────────────

const TOLL_FREE_PREFIXES = ['+1800', '+1888', '+1877', '+1866', '+1855', '+1844', '+1833'];

/** Check if a phone number is toll-free */
export function isTollFreeNumber(phoneNumber: string): boolean {
  return TOLL_FREE_PREFIXES.some(p => phoneNumber.startsWith(p));
}

/** One toll-free verification request, as Telnyx reports it. */
export interface TollFreeVerificationRequest {
  id: string;
  /** 'Verified' | 'Rejected' | 'In Progress' | 'Waiting For Vendor' | ... */
  verificationStatus: string;
  /** Populated on rejection — the carrier's stated reason. */
  reason: string | null;
  businessName: string | null;
  phoneNumbers: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * A point-in-time read of toll-free verification.
 *
 * `ok` is the part that matters. A failed fetch produces zero verified numbers,
 * which is indistinguishable from "nothing is verified" if you only look at the
 * set — and that is exactly the mistake that happened on 2026-07-28, when a
 * script read the wrong response field, reported no verification requests, and
 * the false result stood long enough to produce a wrongly-filed issue and three
 * incorrect documents. The numbers had been verified since January.
 *
 * So anything that *displays* this must branch on `ok` before it renders
 * "not verified". Callers that *gate* on it use getVerifiedTollFreeNumbers(),
 * which stays fail-closed.
 */
export interface TollFreeVerificationSnapshot {
  ok: boolean;
  error?: string;
  requests: TollFreeVerificationRequest[];
  verified: Set<string>;
  fetchedAt: number;
}

// Cache verified numbers for 5 minutes
let verifiedNumbersCache: { snapshot: TollFreeVerificationSnapshot; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Verified toll-free numbers, for gating.
 *
 * Deliberately unchanged in behaviour: an API failure yields an empty set, so
 * send/order paths fail closed. Six routes depend on that. Use
 * getTollFreeVerification() when you need to tell failure from emptiness.
 */
export async function getVerifiedTollFreeNumbers(): Promise<Set<string>> {
  return (await getTollFreeVerification()).verified;
}

/**
 * Full verification state, including rejected and in-progress requests and
 * whether the fetch itself succeeded. Cached for 5 minutes alongside the
 * verified set, so this costs nothing extra.
 */
export async function getTollFreeVerification(): Promise<TollFreeVerificationSnapshot> {
  if (verifiedNumbersCache && Date.now() - verifiedNumbersCache.fetchedAt < CACHE_TTL_MS) {
    return verifiedNumbersCache.snapshot;
  }

  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.error('TELNYX_API_KEY not configured');
    // Not cached — a missing key is a config problem that may be fixed without
    // a restart, and caching it would mask the fix for 5 minutes.
    return { ok: false, error: 'TELNYX_API_KEY is not configured', requests: [], verified: new Set(), fetchedAt: Date.now() };
  }

  const verified = new Set<string>();
  const requests: TollFreeVerificationRequest[] = [];
  let ok = true;
  let error: string | undefined;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `${TELNYX_API_URL}/messaging_tollfree/verification/requests?page=${page}&page_size=20`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('Telnyx verification API error:', response.status);
        ok = false;
        error = `Telnyx returned HTTP ${response.status}`;
        break;
      }

      const data = await response.json();
      // This endpoint returns `records`, NOT `data` — reading `data` here is
      // the exact bug that produced the 2026-07-28 false alarm. The fallback
      // stays only so a future response-shape change degrades rather than
      // silently reporting nothing.
      const records = data.records || data.data || [];

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of records) {
        const phoneNumbers = (record.phoneNumbers || [])
          .map((pn: any) => pn.phoneNumber || pn.phone_number)
          .filter((n: any): n is string => typeof n === 'string');

        requests.push({
          id: record.id,
          verificationStatus: record.verificationStatus ?? 'Unknown',
          reason: record.reason ?? null,
          businessName: record.businessName ?? null,
          phoneNumbers,
          createdAt: record.createdAt ?? null,
          updatedAt: record.updatedAt ?? null,
        });

        if (record.verificationStatus === 'Verified') {
          for (const num of phoneNumbers) verified.add(num);
        }
      }

      // Simple pagination — if we got a full page, check the next
      if (records.length >= 20) {
        page++;
      } else {
        hasMore = false;
      }
    }
  } catch (err: any) {
    console.error('Error fetching toll-free verification status:', err);
    ok = false;
    error = err?.message || 'Could not reach the Telnyx verification API';
  }

  const snapshot: TollFreeVerificationSnapshot = { ok, error, requests, verified, fetchedAt: Date.now() };

  // Only cache a good read. Caching a failure would pin "0 verified" for five
  // minutes and make a transient outage look like a compliance problem — and
  // the refresh button wouldn't clear it.
  if (ok) {
    console.log(`[TF Verification] ${requests.length} request(s), ${verified.size} verified number(s)`);
    verifiedNumbersCache = { snapshot, fetchedAt: Date.now() };
  } else {
    console.error(`[TF Verification] read failed: ${error}`);
  }

  return snapshot;
}

// Get phone numbers from Telnyx
export async function getTelnyxNumbers(): Promise<{
  success: boolean;
  numbers?: Array<{ phone_number: string; friendly_name?: string; type: string }>;
  error?: string;
}> {
  const apiKey = process.env.TELNYX_API_KEY;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey) {
    return { success: false, error: 'Telnyx API key not configured' };
  }

  try {
    // Get numbers assigned to the messaging profile
    const response = await fetch(
      `${TELNYX_API_URL}/messaging_phone_numbers?filter[messaging_profile_id]=${messagingProfileId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.errors?.[0]?.detail || 'Failed to fetch numbers' };
    }

    const numbers = data.data?.map((num: any) => ({
      phone_number: num.phone_number,
      friendly_name: num.phone_number,
      type: num.type || 'long_code',
    })) || [];

    return { success: true, numbers };
  } catch (error: any) {
    console.error('Telnyx numbers error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Carrier-facing health metrics for a number (#38).
 *
 * Reputation attaches to the number, not the tenant, so before a released pool
 * number is handed to a different business it is worth asking Telnyx what shape
 * it is actually in. Verified against the live API rather than assumed: the
 * metrics come back nested under `data.health`, not at the top level.
 *
 * `ok: false` means the question could not be answered — a missing key, a
 * network failure, an unknown number. Callers should treat that as "unknown",
 * not as "healthy" and not as "bad".
 */
export interface NumberHealth {
  ok: boolean;
  messageCount: number;
  spamRatio: number;
  successRatio: number;
  inboundOutboundRatio: number;
  error?: string;
}

export async function getNumberHealth(phoneNumber: string): Promise<NumberHealth> {
  const empty = { messageCount: 0, spamRatio: 0, successRatio: 0, inboundOutboundRatio: 0 };
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    return { ok: false, ...empty, error: 'TELNYX_API_KEY is not configured' };
  }

  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  try {
    // The messaging sub-resource is keyed by Telnyx's internal id, not by the
    // number itself, so this is two calls.
    const lookup = await fetch(
      `${TELNYX_API_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`,
      { headers }
    );
    const lookupBody = await lookup.json();
    const id = lookupBody?.data?.[0]?.id;
    if (!lookup.ok || !id) {
      return { ok: false, ...empty, error: `No Telnyx record for ${phoneNumber}` };
    }

    const res = await fetch(`${TELNYX_API_URL}/phone_numbers/${id}/messaging`, { headers });
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        ...empty,
        error: body?.errors?.[0]?.detail || `Telnyx returned ${res.status}`,
      };
    }

    const health = body?.data?.health ?? {};
    return {
      ok: true,
      messageCount: Number(health.message_count ?? 0),
      spamRatio: Number(health.spam_ratio ?? 0),
      successRatio: Number(health.success_ratio ?? 0),
      inboundOutboundRatio: Number(health.inbound_outbound_ratio ?? 0),
    };
  } catch (err: any) {
    return { ok: false, ...empty, error: err?.message || 'Failed to reach Telnyx' };
  }
}

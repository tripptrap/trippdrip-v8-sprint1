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

// Cache verified numbers for 5 minutes
let verifiedNumbersCache: { numbers: Set<string>; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches verified toll-free numbers from the Telnyx verification API.
 * Results are cached for 5 minutes.
 */
export async function getVerifiedTollFreeNumbers(): Promise<Set<string>> {
  if (verifiedNumbersCache && Date.now() - verifiedNumbersCache.fetchedAt < CACHE_TTL_MS) {
    return verifiedNumbersCache.numbers;
  }

  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.error('TELNYX_API_KEY not configured');
    return new Set();
  }

  const verified = new Set<string>();

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
        break;
      }

      const data = await response.json();
      const records = data.records || data.data || [];

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of records) {
        if (record.verificationStatus === 'Verified') {
          const phoneNumbers = record.phoneNumbers || [];
          for (const pn of phoneNumbers) {
            const num = pn.phoneNumber || pn.phone_number;
            if (typeof num === 'string') {
              verified.add(num);
            }
          }
        }
      }

      // Simple pagination — if we got a full page, check the next
      if (records.length >= 20) {
        page++;
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.error('Error fetching toll-free verification status:', error);
  }

  console.log(`[TF Verification] Found ${verified.size} verified toll-free numbers`);
  verifiedNumbersCache = { numbers: verified, fetchedAt: Date.now() };
  return verified;
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

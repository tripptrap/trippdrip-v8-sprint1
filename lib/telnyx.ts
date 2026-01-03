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
    const requestBody: any = {
      to,
      text: message,
      messaging_profile_id: messagingProfileId,
    };

    // Add from number if provided
    if (from) {
      requestBody.from = from;
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

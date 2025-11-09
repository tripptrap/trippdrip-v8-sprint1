// Twilio SMS Client Integration

import { loadSettings } from './settingsStore';

export type SMSResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  status?: string;
};

// Send SMS via Twilio
export async function sendSMS(
  to: string,
  message: string,
  fromNumber?: string
): Promise<SMSResult> {
  const settings = await loadSettings();

  if (settings.smsProvider !== 'twilio' || !settings.twilio) {
    return {
      success: false,
      error: 'Twilio not configured. Please add your Twilio credentials in Settings.'
    };
  }

  const { accountSid, authToken, phoneNumbers } = settings.twilio;

  if (!accountSid || !authToken) {
    return {
      success: false,
      error: 'Twilio credentials missing'
    };
  }

  if (phoneNumbers.length === 0) {
    return {
      success: false,
      error: 'No phone numbers configured. Please add a Twilio number in Settings.'
    };
  }

  // Use provided number or select one from pool
  const from = fromNumber || phoneNumbers[0];

  try {
    // Call the API endpoint to send SMS
    const response = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from,
        message,
        accountSid,
        authToken
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to send SMS'
      };
    }

    return {
      success: true,
      messageId: result.messageId,
      status: result.status
    };
  } catch (error) {
    console.error('SMS send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Send bulk SMS
export async function sendBulkSMS(
  recipients: Array<{ phone: string; message: string }>,
  fromNumber?: string
): Promise<Array<{ phone: string; result: SMSResult }>> {
  const results = [];

  for (const { phone, message } of recipients) {
    const result = await sendSMS(phone, message, fromNumber);
    results.push({ phone, result });

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

// Format phone number to E.164
export function formatPhoneE164(phone: string, defaultCountryCode: string = '+1'): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');

  // If it doesn't start with country code, add default
  if (!phone.startsWith('+')) {
    // If it's 10 digits (US number without country code)
    if (cleaned.length === 10) {
      cleaned = defaultCountryCode.replace('+', '') + cleaned;
    }
  } else {
    cleaned = phone.replace(/\D/g, '');
  }

  return '+' + cleaned;
}

// Validate phone number format
export function isValidPhoneNumber(phone: string): boolean {
  // E.164 format: +[country code][number]
  // Should be 10-15 digits total
  const e164Pattern = /^\+[1-9]\d{9,14}$/;
  return e164Pattern.test(phone);
}

// Twilio SMS utility functions
import twilio from 'twilio';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken) {
  console.warn('⚠️ Twilio credentials not configured. SMS functionality will not work.');
}

let twilioClient: twilio.Twilio | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

export interface SendSMSParams {
  to: string;
  message: string;
  from?: string; // Optional: override default Twilio phone number
}

export interface SendSMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  status?: string;
}

/**
 * Send SMS using Twilio
 * @param params - SMS parameters (to, message, optional from)
 * @returns Result object with success status and message SID or error
 */
export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const { to, message, from } = params;

  // Validate Twilio is configured
  if (!twilioClient) {
    return {
      success: false,
      error: 'Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    };
  }

  // Validate phone number is configured
  const fromNumber = from || twilioPhoneNumber;
  if (!fromNumber) {
    return {
      success: false,
      error: 'No Twilio phone number configured. Set TWILIO_PHONE_NUMBER in environment variables.',
    };
  }

  // Validate recipient phone number
  if (!to || !to.trim()) {
    return {
      success: false,
      error: 'Recipient phone number is required.',
    };
  }

  // Ensure phone number is in E.164 format (+1XXXXXXXXXX)
  let formattedTo = to.trim();
  if (!formattedTo.startsWith('+')) {
    // Remove all non-numeric characters
    const digits = formattedTo.replace(/\D/g, '');

    // Add +1 if it's a 10-digit US number
    if (digits.length === 10) {
      formattedTo = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      formattedTo = `+${digits}`;
    } else {
      formattedTo = `+${digits}`;
    }
  }

  try {
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: formattedTo,
    });

    return {
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
    };
  } catch (error: any) {
    console.error('❌ Twilio SMS Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS via Twilio',
    };
  }
}

/**
 * Get list of available Twilio phone numbers for the account
 */
export async function getPhoneNumbers(): Promise<{ success: boolean; phoneNumbers?: string[]; error?: string }> {
  if (!twilioClient) {
    return {
      success: false,
      error: 'Twilio client not initialized',
    };
  }

  try {
    const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list();
    const phoneNumbers = incomingPhoneNumbers.map((record) => record.phoneNumber);

    return {
      success: true,
      phoneNumbers,
    };
  } catch (error: any) {
    console.error('❌ Error fetching Twilio phone numbers:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch phone numbers',
    };
  }
}

/**
 * Check if Twilio is properly configured
 */
export function isTwilioConfigured(): boolean {
  return !!(accountSid && authToken && twilioPhoneNumber);
}

/**
 * Get Twilio configuration status
 */
export function getTwilioStatus() {
  return {
    configured: isTwilioConfigured(),
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    hasPhoneNumber: !!twilioPhoneNumber,
    phoneNumber: twilioPhoneNumber || null,
  };
}

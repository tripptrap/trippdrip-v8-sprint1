// Twilio SMS and RCS utility functions
import twilio from 'twilio';

// Initialize Twilio client (master account - only used as fallback)
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
  channel?: 'sms' | 'rcs'; // Channel type (default: sms)
  mediaUrl?: string[]; // Optional: media URLs for MMS/RCS
  // User-specific credentials (for multi-tenant subaccount support)
  userAccountSid?: string;
  userAuthToken?: string;
}

export interface SendSMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  status?: string;
  channel?: 'sms' | 'rcs';
}

/**
 * Send SMS or RCS message using Twilio
 * @param params - Message parameters (to, message, optional from, channel, mediaUrl)
 * @returns Result object with success status and message SID or error
 */
export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const { to, message, from, channel = 'sms', mediaUrl, userAccountSid, userAuthToken } = params;

  // Use user-specific credentials if provided, otherwise use master account
  let clientToUse: twilio.Twilio | null = twilioClient;

  if (userAccountSid && userAuthToken) {
    // Create a client with user's subaccount credentials
    console.log(`🔐 Using user-specific Twilio subaccount: ${userAccountSid}`);
    clientToUse = twilio(userAccountSid, userAuthToken);
  }

  // Validate Twilio is configured
  if (!clientToUse) {
    return {
      success: false,
      error: 'Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
      channel,
    };
  }

  // Determine the from number
  const fromNumber = from || twilioPhoneNumber || '';
  if (!fromNumber) {
    return {
      success: false,
      error: 'No Twilio phone number configured. Set TWILIO_PHONE_NUMBER in environment variables.',
      channel,
    };
  }

  // Validate recipient phone number
  if (!to || !to.trim()) {
    return {
      success: false,
      error: 'Recipient phone number is required.',
      channel,
    };
  }

  // Format recipient number - Ensure phone number is in E.164 format (+1XXXXXXXXXX)
  // RCS and SMS both use the same format
  let formattedTo = to.trim();
  if (!formattedTo.startsWith('+')) {
    const digits = formattedTo.replace(/\D/g, '');
    if (digits.length === 10) {
      formattedTo = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      formattedTo = `+${digits}`;
    } else {
      formattedTo = `+${digits}`;
    }
  }

  try {
    const messageParams: any = {
      body: message,
      from: fromNumber,
      to: formattedTo,
    };

    // Add media URLs if provided
    if (mediaUrl && mediaUrl.length > 0) {
      messageParams.mediaUrl = mediaUrl;
    }

    // Add status callback URL to track delivery status
    const statusCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/status-callback`;
    messageParams.statusCallback = statusCallbackUrl;

    const twilioMessage = await clientToUse.messages.create(messageParams);

    return {
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      channel,
    };
  } catch (error: any) {
    console.error(`❌ Twilio ${channel.toUpperCase()} Error:`, error);
    return {
      success: false,
      error: error.message || `Failed to send ${channel.toUpperCase()} via Twilio`,
      channel,
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

// Settings Management System

export type SMSProvider = 'twilio' | 'none';
export type EmailProvider = 'smtp' | 'sendgrid' | 'none';

export type PurchasedNumber = {
  phoneNumber: string;
  sid: string; // Twilio resource SID
  friendlyName?: string;
  dateCreated?: string;
};

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  phoneNumbers: string[]; // Array of purchased Twilio numbers (legacy)
  purchasedNumbers: PurchasedNumber[]; // Detailed purchased numbers
};

export type StripeConfig = {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
};

export type EmailConfig = {
  provider: EmailProvider;
  // SMTP settings
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  // SendGrid settings
  sendgridApiKey?: string;
  // Common settings
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

export type Settings = {
  smsProvider: SMSProvider;
  twilio?: TwilioConfig;
  stripe?: StripeConfig;
  email?: EmailConfig;
  spamProtection: {
    enabled: boolean;
    blockOnHighRisk: boolean;
    maxHourlyMessages: number;
    maxDailyMessages: number;
  };
  autoRefill: {
    enabled: boolean;
    threshold: number;
    amount: number;
  };
};

export async function loadSettings(): Promise<Settings> {
  if (typeof window === 'undefined') return getDefaultSettings();

  try {
    const response = await fetch('/api/settings');
    const data = await response.json();

    if (data.ok && data.settings) {
      return data.settings;
    }

    return getDefaultSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
    return getDefaultSettings();
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    // Trigger custom event for real-time updates
    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

export function getDefaultSettings(): Settings {
  return {
    smsProvider: 'none',
    spamProtection: {
      enabled: true,
      blockOnHighRisk: true,
      maxHourlyMessages: 100,
      maxDailyMessages: 1000
    },
    autoRefill: {
      enabled: false,
      threshold: 100,
      amount: 500
    }
  };
}

// Update Twilio configuration
export async function updateTwilioConfig(config: TwilioConfig): Promise<Settings> {
  const settings = await loadSettings();
  settings.smsProvider = 'twilio';
  settings.twilio = config;
  await saveSettings(settings);
  return settings;
}

// Update Stripe configuration
export async function updateStripeConfig(config: StripeConfig): Promise<Settings> {
  const settings = await loadSettings();
  settings.stripe = config;
  await saveSettings(settings);
  return settings;
}

// Update spam protection settings
export async function updateSpamProtection(config: Partial<Settings['spamProtection']>): Promise<Settings> {
  const settings = await loadSettings();
  settings.spamProtection = { ...settings.spamProtection, ...config };
  await saveSettings(settings);
  return settings;
}

// Update auto refill settings
export async function updateAutoRefill(config: Partial<Settings['autoRefill']>): Promise<Settings> {
  const settings = await loadSettings();
  settings.autoRefill = { ...settings.autoRefill, ...config };
  await saveSettings(settings);
  return settings;
}

// Add a phone number to Twilio configuration
export async function addPhoneNumber(phoneNumber: string, sid?: string, friendlyName?: string): Promise<Settings> {
  const settings = await loadSettings();
  if (!settings.twilio) {
    throw new Error('Twilio not configured');
  }

  // Add to legacy array
  if (!settings.twilio.phoneNumbers.includes(phoneNumber)) {
    settings.twilio.phoneNumbers.push(phoneNumber);
  }

  // Add to detailed array
  if (!settings.twilio.purchasedNumbers) {
    settings.twilio.purchasedNumbers = [];
  }

  const exists = settings.twilio.purchasedNumbers.find(n => n.phoneNumber === phoneNumber);
  if (!exists && sid) {
    settings.twilio.purchasedNumbers.push({
      phoneNumber,
      sid,
      friendlyName,
      dateCreated: new Date().toISOString()
    });
  }

  await saveSettings(settings);
  return settings;
}

// Remove a phone number from Twilio configuration
export async function removePhoneNumber(phoneNumber: string): Promise<Settings> {
  const settings = await loadSettings();
  if (!settings.twilio) {
    throw new Error('Twilio not configured');
  }

  // Remove from legacy array
  settings.twilio.phoneNumbers = settings.twilio.phoneNumbers.filter(
    num => num !== phoneNumber
  );

  // Remove from detailed array
  if (settings.twilio.purchasedNumbers) {
    settings.twilio.purchasedNumbers = settings.twilio.purchasedNumbers.filter(
      num => num.phoneNumber !== phoneNumber
    );
  }

  await saveSettings(settings);
  return settings;
}

// Get phone number SID (needed for releasing)
export async function getPhoneNumberSid(phoneNumber: string): Promise<string | null> {
  const settings = await loadSettings();
  const number = settings.twilio?.purchasedNumbers?.find(n => n.phoneNumber === phoneNumber);
  return number?.sid || null;
}

// Get available phone numbers for sending
export async function getAvailablePhoneNumbers(): Promise<string[]> {
  const settings = await loadSettings();
  return settings.twilio?.phoneNumbers || [];
}

// Check if SMS sending is properly configured
export async function isSMSConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.smsProvider === 'twilio' &&
         !!settings.twilio?.accountSid &&
         !!settings.twilio?.authToken &&
         (settings.twilio?.phoneNumbers?.length || 0) > 0;
}

// Check if Stripe is configured
export async function isStripeConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  return !!settings.stripe?.publishableKey && !!settings.stripe?.secretKey;
}

// Update email configuration
export async function updateEmailConfig(config: EmailConfig): Promise<Settings> {
  const settings = await loadSettings();
  settings.email = config;
  await saveSettings(settings);
  return settings;
}

// Check if email is properly configured
export async function isEmailConfigured(): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.email || settings.email.provider === 'none') return false;

  if (settings.email.provider === 'smtp') {
    return !!settings.email.smtpHost &&
           !!settings.email.smtpUser &&
           !!settings.email.smtpPass &&
           !!settings.email.fromEmail;
  }

  if (settings.email.provider === 'sendgrid') {
    return !!settings.email.sendgridApiKey && !!settings.email.fromEmail;
  }

  return false;
}

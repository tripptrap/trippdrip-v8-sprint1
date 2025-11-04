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

const STORAGE_KEY = 'trippdrip.settings.v1';

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return getDefaultSettings();

  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    const defaultSettings = getDefaultSettings();
    saveSettings(defaultSettings);
    return defaultSettings;
  }

  return JSON.parse(data);
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  // Trigger custom event for real-time updates
  window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
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
export function updateTwilioConfig(config: TwilioConfig): Settings {
  const settings = loadSettings();
  settings.smsProvider = 'twilio';
  settings.twilio = config;
  saveSettings(settings);
  return settings;
}

// Update Stripe configuration
export function updateStripeConfig(config: StripeConfig): Settings {
  const settings = loadSettings();
  settings.stripe = config;
  saveSettings(settings);
  return settings;
}

// Update spam protection settings
export function updateSpamProtection(config: Partial<Settings['spamProtection']>): Settings {
  const settings = loadSettings();
  settings.spamProtection = { ...settings.spamProtection, ...config };
  saveSettings(settings);
  return settings;
}

// Update auto refill settings
export function updateAutoRefill(config: Partial<Settings['autoRefill']>): Settings {
  const settings = loadSettings();
  settings.autoRefill = { ...settings.autoRefill, ...config };
  saveSettings(settings);
  return settings;
}

// Add a phone number to Twilio configuration
export function addPhoneNumber(phoneNumber: string, sid?: string, friendlyName?: string): Settings {
  const settings = loadSettings();
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

  saveSettings(settings);
  return settings;
}

// Remove a phone number from Twilio configuration
export function removePhoneNumber(phoneNumber: string): Settings {
  const settings = loadSettings();
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

  saveSettings(settings);
  return settings;
}

// Get phone number SID (needed for releasing)
export function getPhoneNumberSid(phoneNumber: string): string | null {
  const settings = loadSettings();
  const number = settings.twilio?.purchasedNumbers?.find(n => n.phoneNumber === phoneNumber);
  return number?.sid || null;
}

// Get available phone numbers for sending
export function getAvailablePhoneNumbers(): string[] {
  const settings = loadSettings();
  return settings.twilio?.phoneNumbers || [];
}

// Check if SMS sending is properly configured
export function isSMSConfigured(): boolean {
  const settings = loadSettings();
  return settings.smsProvider === 'twilio' &&
         !!settings.twilio?.accountSid &&
         !!settings.twilio?.authToken &&
         (settings.twilio?.phoneNumbers?.length || 0) > 0;
}

// Check if Stripe is configured
export function isStripeConfigured(): boolean {
  const settings = loadSettings();
  return !!settings.stripe?.publishableKey && !!settings.stripe?.secretKey;
}

// Update email configuration
export function updateEmailConfig(config: EmailConfig): Settings {
  const settings = loadSettings();
  settings.email = config;
  saveSettings(settings);
  return settings;
}

// Check if email is properly configured
export function isEmailConfigured(): boolean {
  const settings = loadSettings();
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

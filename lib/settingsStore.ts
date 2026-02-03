// Settings Management System

export type EmailProvider = 'smtp' | 'sendgrid' | 'none';

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
  stripe?: StripeConfig;
  email?: EmailConfig;
  optOutKeyword?: string;
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

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
    // Advanced rate limiting
    maxMessagesPerMinute: number;        // Burst protection
    maxMessagesPerContact: number;       // Per-contact daily limit
    cooldownMinutes: number;             // Min time between messages to same contact
    maxCampaignMessagesPerHour: number;  // Campaign-specific hourly limit
    maxBulkRecipients: number;           // Max recipients per bulk send
    enableWeekendLimits: boolean;        // Reduce limits on weekends
    weekendLimitPercent: number;         // Percentage of normal limits on weekends
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

/**
 * Throws on failure (#128).
 *
 * This used to swallow everything: the fetch result was never inspected, so a
 * 400 or a 500 was indistinguishable from success, and the `catch` turned a
 * network failure into a silent no-op. It then dispatched `settingsUpdated`
 * regardless, so the rest of the app re-rendered with values the server had
 * rejected.
 *
 * Every caller shows a success message, so swallowing here meant the product
 * reported "saved!" for settings that were not saved — the same class of lie
 * this issue is about. Throwing makes the three callers handle it; they now do.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  if (typeof window === 'undefined') return;

  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    // Prefer the server's own explanation — validation returns a specific
    // reason, and "could not save" helps nobody fix an out-of-range value.
    let detail = `Save failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* non-JSON error body; keep the status line */
    }
    throw new Error(detail);
  }

  // Only after the server has accepted it. Dispatching on a failed save told
  // every listener the new values were live when they were not.
  window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
}

export function getDefaultSettings(): Settings {
  return {
    spamProtection: {
      enabled: true,
      blockOnHighRisk: true,
      maxHourlyMessages: 100,
      maxDailyMessages: 1000,
      // Advanced rate limiting defaults
      maxMessagesPerMinute: 10,
      maxMessagesPerContact: 5,
      cooldownMinutes: 30,
      maxCampaignMessagesPerHour: 200,
      maxBulkRecipients: 500,
      enableWeekendLimits: false,
      weekendLimitPercent: 50
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

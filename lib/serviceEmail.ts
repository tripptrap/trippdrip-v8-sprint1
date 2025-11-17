// Service Email Helper Library
// Simplifies sending transactional emails throughout the application

type ServiceEmailType =
  | 'welcome'
  | 'password_reset'
  | 'email_verification'
  | 'low_points_warning'
  | 'campaign_completed'
  | 'monthly_summary'
  | 'account_suspended'
  | 'payment_failed';

interface BaseEmailData {
  to: string;
  userName?: string;
}

interface WelcomeEmailData extends BaseEmailData {
  loginUrl?: string;
}

interface PasswordResetEmailData extends BaseEmailData {
  resetUrl: string;
  expiresIn?: string;
}

interface EmailVerificationData extends BaseEmailData {
  verifyUrl: string;
}

interface LowPointsWarningData extends BaseEmailData {
  currentPoints: number;
}

interface CampaignCompletedData extends BaseEmailData {
  campaignName: string;
  stats: {
    sent: number;
    delivered: number;
    failed: number;
  };
}

interface MonthlySummaryData extends BaseEmailData {
  stats: {
    messagesSent: number;
    leadsAdded: number;
    conversationsStarted: number;
    responseRate: number;
  };
}

interface AccountSuspendedData extends BaseEmailData {
  reason: string;
}

interface PaymentFailedData extends BaseEmailData {
  amount: number;
  retryUrl?: string;
}

class ServiceEmailClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.apiKey = process.env.SYSTEM_API_KEY;
  }

  private async send(type: ServiceEmailType, data: any): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/email/service`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'x-api-key': this.apiKey }),
        },
        body: JSON.stringify({
          type,
          to: data.to,
          data,
        }),
      });

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error(`Error sending ${type} email:`, error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Send a welcome email to a new user
   */
  async sendWelcomeEmail(data: WelcomeEmailData) {
    return this.send('welcome', data);
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData) {
    return this.send('password_reset', data);
  }

  /**
   * Send an email verification email
   */
  async sendEmailVerificationEmail(data: EmailVerificationData) {
    return this.send('email_verification', data);
  }

  /**
   * Send a low points warning email
   */
  async sendLowPointsWarningEmail(data: LowPointsWarningData) {
    return this.send('low_points_warning', data);
  }

  /**
   * Send a campaign completed notification email
   */
  async sendCampaignCompletedEmail(data: CampaignCompletedData) {
    return this.send('campaign_completed', data);
  }

  /**
   * Send a monthly summary email
   */
  async sendMonthlySummaryEmail(data: MonthlySummaryData) {
    return this.send('monthly_summary', data);
  }

  /**
   * Send an account suspended notification email
   */
  async sendAccountSuspendedEmail(data: AccountSuspendedData) {
    return this.send('account_suspended', data);
  }

  /**
   * Send a payment failed notification email
   */
  async sendPaymentFailedEmail(data: PaymentFailedData) {
    return this.send('payment_failed', data);
  }
}

// Export singleton instance
export const serviceEmail = new ServiceEmailClient();

// Export types for use in other files
export type {
  WelcomeEmailData,
  PasswordResetEmailData,
  EmailVerificationData,
  LowPointsWarningData,
  CampaignCompletedData,
  MonthlySummaryData,
  AccountSuspendedData,
  PaymentFailedData,
};

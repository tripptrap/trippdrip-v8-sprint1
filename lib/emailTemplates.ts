// Email Templates for HyveWyre Service Emails

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

const BRAND_COLOR = '#3b82f6';
const BRAND_NAME = 'HyveWyre';
const SUPPORT_EMAIL = 'support@hyvewyre.com';
const COMPANY_ADDRESS = '12325 Magnolia Street, San Antonio, Florida 33576';

// Base HTML wrapper for all emails
const htmlWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">${BRAND_NAME}</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                ${BRAND_NAME} - AI-Powered Communication Platform
              </p>
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">
                ${COMPANY_ADDRESS}
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_COLOR};">${SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Button component
const button = (text: string, url: string) => `
  <table role="presentation" style="margin: 30px 0;">
    <tr>
      <td align="center">
        <a href="${url}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">${text}</a>
      </td>
    </tr>
  </table>
`;

// Welcome Email
export const welcomeEmail = (userName: string, loginUrl: string): EmailTemplate => ({
  subject: `Welcome to ${BRAND_NAME}!`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">Welcome to ${BRAND_NAME}, ${userName}! 🎉</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      We're thrilled to have you join our platform! ${BRAND_NAME} empowers you to connect with your leads through AI-powered SMS automation, conversation flows, and unified messaging.
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Here's what you can do to get started:
    </p>
    <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #374151; font-size: 16px; line-height: 1.8;">
      <li>Import your leads or scrape new ones</li>
      <li>Create AI-powered conversation flows</li>
      <li>Set up bulk SMS campaigns</li>
      <li>Track analytics and engagement</li>
    </ul>
    ${button('Get Started', loginUrl)}
    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
      Need help? Check out our <a href="https://docs.hyvewyre.com" style="color: ${BRAND_COLOR};">documentation</a> or reach out to our support team.
    </p>
  `),
  text: `Welcome to ${BRAND_NAME}, ${userName}!\n\nWe're thrilled to have you join our platform! ${BRAND_NAME} empowers you to connect with your leads through AI-powered SMS automation, conversation flows, and unified messaging.\n\nHere's what you can do to get started:\n- Import your leads or scrape new ones\n- Create AI-powered conversation flows\n- Set up bulk SMS campaigns\n- Track analytics and engagement\n\nGet started: ${loginUrl}\n\nNeed help? Check out our documentation at https://docs.hyvewyre.com or reach out to our support team at ${SUPPORT_EMAIL}.`
});

// Password Reset Email
export const passwordResetEmail = (userName: string, resetUrl: string, expiresIn: string = '1 hour'): EmailTemplate => ({
  subject: `Reset Your ${BRAND_NAME} Password`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">Password Reset Request</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      We received a request to reset your password. Click the button below to create a new password:
    </p>
    ${button('Reset Password', resetUrl)}
    <p style="margin: 20px 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      This link will expire in <strong>${expiresIn}</strong>.
    </p>
    <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
    <p style="margin: 0; color: #6b7280; font-size: 12px;">
      For security reasons, please don't share this link with anyone.
    </p>
  `),
  text: `Password Reset Request\n\nHi ${userName},\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${resetUrl}\n\nThis link will expire in ${expiresIn}.\n\nIf you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.\n\nFor security reasons, please don't share this link with anyone.`
});

// Email Verification
export const emailVerificationEmail = (userName: string, verifyUrl: string): EmailTemplate => ({
  subject: `Verify Your ${BRAND_NAME} Email Address`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">Verify Your Email Address</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Thanks for signing up! Please verify your email address to activate your account and start using all features.
    </p>
    ${button('Verify Email', verifyUrl)}
    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
      If you didn't create an account with ${BRAND_NAME}, you can safely ignore this email.
    </p>
  `),
  text: `Verify Your Email Address\n\nHi ${userName},\n\nThanks for signing up! Please verify your email address to activate your account and start using all features.\n\nVerify your email: ${verifyUrl}\n\nIf you didn't create an account with ${BRAND_NAME}, you can safely ignore this email.`
});

// Low Points Warning
export const lowPointsWarningEmail = (userName: string, currentPoints: number, dashboardUrl: string): EmailTemplate => ({
  subject: `Low Points Alert - ${BRAND_NAME}`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">⚠️ Low Points Alert</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Your points balance is running low. You currently have <strong>${currentPoints} points</strong> remaining.
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      To continue sending messages and using AI features without interruption, we recommend purchasing more points.
    </p>
    ${button('Buy Points', `${dashboardUrl}/points`)}
    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
      Need help? Our support team is here to assist you at ${SUPPORT_EMAIL}.
    </p>
  `),
  text: `Low Points Alert\n\nHi ${userName},\n\nYour points balance is running low. You currently have ${currentPoints} points remaining.\n\nTo continue sending messages and using AI features without interruption, we recommend purchasing more points.\n\nBuy points: ${dashboardUrl}/points\n\nNeed help? Our support team is here to assist you at ${SUPPORT_EMAIL}.`
});

// Campaign Completed
export const campaignCompletedEmail = (userName: string, campaignName: string, stats: { sent: number; delivered: number; failed: number }, dashboardUrl: string): EmailTemplate => ({
  subject: `Campaign "${campaignName}" Completed - ${BRAND_NAME}`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">✅ Campaign Completed</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Your campaign "<strong>${campaignName}</strong>" has finished running!
    </p>
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
      <tr>
        <td style="padding: 15px; background-color: #f9fafb; border-radius: 6px;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #374151; font-size: 16px;"><strong>Messages Sent:</strong></td>
              <td style="padding: 8px 0; color: #374151; font-size: 16px; text-align: right;">${stats.sent}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #10b981; font-size: 16px;"><strong>Delivered:</strong></td>
              <td style="padding: 8px 0; color: #10b981; font-size: 16px; text-align: right;">${stats.delivered}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #ef4444; font-size: 16px;"><strong>Failed:</strong></td>
              <td style="padding: 8px 0; color: #ef4444; font-size: 16px; text-align: right;">${stats.failed}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${button('View Campaign Details', `${dashboardUrl}/campaigns`)}
    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
      Check your dashboard for detailed analytics and response rates.
    </p>
  `),
  text: `Campaign Completed\n\nHi ${userName},\n\nYour campaign "${campaignName}" has finished running!\n\nResults:\n- Messages Sent: ${stats.sent}\n- Delivered: ${stats.delivered}\n- Failed: ${stats.failed}\n\nView campaign details: ${dashboardUrl}/campaigns\n\nCheck your dashboard for detailed analytics and response rates.`
});

// Monthly Summary
export const monthlySummaryEmail = (userName: string, stats: { messagesSent: number; leadsAdded: number; conversationsStarted: number; responseRate: number }, dashboardUrl: string): EmailTemplate => ({
  subject: `Your ${BRAND_NAME} Monthly Summary`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">📊 Your Monthly Summary</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 25px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Here's a summary of your activity this month:
    </p>
    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
      <tr>
        <td style="padding: 15px; background-color: #eff6ff; border-radius: 6px; margin-bottom: 10px;">
          <p style="margin: 0 0 5px 0; color: #1e40af; font-size: 14px; font-weight: bold;">Messages Sent</p>
          <p style="margin: 0; color: #1e3a8a; font-size: 28px; font-weight: bold;">${stats.messagesSent.toLocaleString()}</p>
        </td>
      </tr>
      <tr><td style="height: 10px;"></td></tr>
      <tr>
        <td style="padding: 15px; background-color: #f0fdf4; border-radius: 6px;">
          <p style="margin: 0 0 5px 0; color: #15803d; font-size: 14px; font-weight: bold;">Leads Added</p>
          <p style="margin: 0; color: #166534; font-size: 28px; font-weight: bold;">${stats.leadsAdded.toLocaleString()}</p>
        </td>
      </tr>
      <tr><td style="height: 10px;"></td></tr>
      <tr>
        <td style="padding: 15px; background-color: #fef3c7; border-radius: 6px;">
          <p style="margin: 0 0 5px 0; color: #92400e; font-size: 14px; font-weight: bold;">Conversations Started</p>
          <p style="margin: 0; color: #78350f; font-size: 28px; font-weight: bold;">${stats.conversationsStarted.toLocaleString()}</p>
        </td>
      </tr>
      <tr><td style="height: 10px;"></td></tr>
      <tr>
        <td style="padding: 15px; background-color: #f3e8ff; border-radius: 6px;">
          <p style="margin: 0 0 5px 0; color: #6b21a8; font-size: 14px; font-weight: bold;">Response Rate</p>
          <p style="margin: 0; color: #581c87; font-size: 28px; font-weight: bold;">${stats.responseRate}%</p>
        </td>
      </tr>
    </table>
    ${button('View Full Analytics', `${dashboardUrl}/analytics`)}
  `),
  text: `Your Monthly Summary\n\nHi ${userName},\n\nHere's a summary of your activity this month:\n\n- Messages Sent: ${stats.messagesSent.toLocaleString()}\n- Leads Added: ${stats.leadsAdded.toLocaleString()}\n- Conversations Started: ${stats.conversationsStarted.toLocaleString()}\n- Response Rate: ${stats.responseRate}%\n\nView full analytics: ${dashboardUrl}/analytics`
});

// Account Suspended
export const accountSuspendedEmail = (userName: string, reason: string, supportUrl: string): EmailTemplate => ({
  subject: `Account Suspended - ${BRAND_NAME}`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #dc2626; font-size: 24px;">⚠️ Account Suspended</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Your ${BRAND_NAME} account has been temporarily suspended.
    </p>
    <div style="padding: 15px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: bold;">Reason:</p>
      <p style="margin: 5px 0 0 0; color: #991b1b; font-size: 14px;">${reason}</p>
    </div>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      If you believe this is a mistake or would like to appeal this suspension, please contact our support team immediately.
    </p>
    ${button('Contact Support', supportUrl)}
  `),
  text: `Account Suspended\n\nHi ${userName},\n\nYour ${BRAND_NAME} account has been temporarily suspended.\n\nReason: ${reason}\n\nIf you believe this is a mistake or would like to appeal this suspension, please contact our support team immediately.\n\nContact support: ${supportUrl}`
});

// Payment Failed
export const paymentFailedEmail = (userName: string, amount: number, retryUrl: string): EmailTemplate => ({
  subject: `Payment Failed - ${BRAND_NAME}`,
  html: htmlWrapper(`
    <h2 style="margin: 0 0 20px 0; color: #dc2626; font-size: 24px;">Payment Failed</h2>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Hi ${userName},
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      We were unable to process your payment of <strong>$${amount.toFixed(2)}</strong>.
    </p>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      This could be due to:
    </p>
    <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #374151; font-size: 16px; line-height: 1.8;">
      <li>Insufficient funds</li>
      <li>Expired card</li>
      <li>Card declined by your bank</li>
    </ul>
    <p style="margin: 0 0 15px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Please update your payment method to continue using ${BRAND_NAME} without interruption.
    </p>
    ${button('Update Payment Method', retryUrl)}
  `),
  text: `Payment Failed\n\nHi ${userName},\n\nWe were unable to process your payment of $${amount.toFixed(2)}.\n\nThis could be due to:\n- Insufficient funds\n- Expired card\n- Card declined by your bank\n\nPlease update your payment method to continue using ${BRAND_NAME} without interruption.\n\nUpdate payment method: ${retryUrl}`
});

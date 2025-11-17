import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@/lib/supabase/server';
import {
  welcomeEmail,
  passwordResetEmail,
  emailVerificationEmail,
  lowPointsWarningEmail,
  campaignCompletedEmail,
  monthlySummaryEmail,
  accountSuspendedEmail,
  paymentFailedEmail,
  EmailTemplate
} from '@/lib/emailTemplates';

const FROM_EMAIL = process.env.SERVICE_EMAIL_FROM || 'noreply@hyvewyre.com';
const FROM_NAME = process.env.SERVICE_EMAIL_FROM_NAME || 'HyveWyre';

// Create a transporter using environment variables
function createTransporter() {
  const provider = process.env.SERVICE_EMAIL_PROVIDER || 'smtp';

  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // Default SMTP
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

type ServiceEmailType =
  | 'welcome'
  | 'password_reset'
  | 'email_verification'
  | 'low_points_warning'
  | 'campaign_completed'
  | 'monthly_summary'
  | 'account_suspended'
  | 'payment_failed';

type ServiceEmailData = {
  type: ServiceEmailType;
  to: string;
  data: any;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify request is from authenticated user or system
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Allow system calls (for cron jobs, webhooks, etc.) with API key
    const apiKey = req.headers.get('x-api-key');
    const systemApiKey = process.env.SYSTEM_API_KEY;

    if (!user && (!apiKey || apiKey !== systemApiKey)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: ServiceEmailData = await req.json();
    const { type, to, data } = body;

    if (!type || !to) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: type, to' },
        { status: 400 }
      );
    }

    // Generate email template based on type
    let template: EmailTemplate;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';

    switch (type) {
      case 'welcome':
        template = welcomeEmail(
          data.userName || 'there',
          data.loginUrl || `${baseUrl}/dashboard`
        );
        break;

      case 'password_reset':
        template = passwordResetEmail(
          data.userName || 'there',
          data.resetUrl,
          data.expiresIn || '1 hour'
        );
        break;

      case 'email_verification':
        template = emailVerificationEmail(
          data.userName || 'there',
          data.verifyUrl
        );
        break;

      case 'low_points_warning':
        template = lowPointsWarningEmail(
          data.userName || 'there',
          data.currentPoints || 0,
          `${baseUrl}/dashboard`
        );
        break;

      case 'campaign_completed':
        template = campaignCompletedEmail(
          data.userName || 'there',
          data.campaignName,
          data.stats || { sent: 0, delivered: 0, failed: 0 },
          `${baseUrl}/dashboard`
        );
        break;

      case 'monthly_summary':
        template = monthlySummaryEmail(
          data.userName || 'there',
          data.stats || { messagesSent: 0, leadsAdded: 0, conversationsStarted: 0, responseRate: 0 },
          `${baseUrl}/dashboard`
        );
        break;

      case 'account_suspended':
        template = accountSuspendedEmail(
          data.userName || 'there',
          data.reason || 'Violation of terms of service',
          `${baseUrl}/contact`
        );
        break;

      case 'payment_failed':
        template = paymentFailedEmail(
          data.userName || 'there',
          data.amount || 0,
          data.retryUrl || `${baseUrl}/points`
        );
        break;

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown email type: ${type}` },
          { status: 400 }
        );
    }

    // Send email
    const transporter = createTransporter();
    const mailOptions = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    try {
      const info = await transporter.sendMail(mailOptions);

      // Log email to database for tracking
      if (user) {
        await supabase.from('service_emails').insert({
          user_id: user.id,
          email_type: type,
          recipient: to,
          subject: template.subject,
          status: 'sent',
          message_id: info.messageId,
          sent_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        ok: true,
        messageId: info.messageId,
        type,
      });
    } catch (error: any) {
      console.error('Error sending service email:', error);

      // Log failed email
      if (user) {
        await supabase.from('service_emails').insert({
          user_id: user.id,
          email_type: type,
          recipient: to,
          subject: template.subject,
          status: 'failed',
          error: error.message,
          sent_at: new Date().toISOString(),
        });
      }

      return NextResponse.json(
        { ok: false, error: `Failed to send email: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in service email route:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

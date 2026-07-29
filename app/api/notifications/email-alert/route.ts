import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';
import {
  newMessageAlertEmail,
  appointmentAlertEmail,
  lowCreditsAlertEmail,
  optOutAlertEmail,
} from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

type AlertType = 'new_message' | 'appointment' | 'low_credits' | 'opt_out';

function createTransporter() {
  // .trim() matters: several production env values carry a trailing
  // newline, and this is an exact string comparison — 'sendgrid\n'
  // silently falls through to the SMTP branch, which has no credentials
  // configured, so email fails with no error anyone sees.
  const provider = (process.env.SERVICE_EMAIL_PROVIDER || 'smtp').trim();
  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }

  // Reached whenever the provider isn't sendgrid. Without credentials this
  // builds a transport pointing at smtp.gmail.com with no auth, which fails
  // per-send with an opaque error rather than saying the app is misconfigured.
  // In production SMTP_* are all unset (#84), so this branch is only correct if
  // someone has deliberately configured SMTP.
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error(
      `Email is not configured: SERVICE_EMAIL_PROVIDER is "${provider}", which needs ` +
      `SMTP_USER and SMTP_PASSWORD. Set those, or set SERVICE_EMAIL_PROVIDER=sendgrid ` +
      `with SENDGRID_API_KEY.`
    );
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Also allow system calls (cron/webhooks) with API key
    const apiKey = req.headers.get('x-api-key');
    const isSystemCall = apiKey && apiKey === process.env.SYSTEM_API_KEY?.trim();

    if (!user && !isSystemCall) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { type, userId, leadName, leadPhone, message, appointmentTime, currentCredits } = await req.json();

    // Resolve which user we're alerting
    const targetUserId = userId || user?.id;
    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: 'Missing userId' }, { status: 400 });
    }

    // Get user's email and preferences
    const { data: userData } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', targetUserId)
      .single();

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('email_alerts_enabled, email_alert_new_message, email_alert_low_credits, email_alert_opt_out, email_alert_appointment')
      .eq('user_id', targetUserId)
      .single();

    if (!userData?.email) {
      return NextResponse.json({ ok: false, error: 'No email address on file' });
    }

    if (!prefs?.email_alerts_enabled) {
      return NextResponse.json({ ok: false, error: 'Email alerts disabled' });
    }

    // Check per-type preference
    const prefMap: Record<AlertType, boolean> = {
      new_message: prefs.email_alert_new_message ?? true,
      appointment: prefs.email_alert_appointment ?? true,
      low_credits: prefs.email_alert_low_credits ?? true,
      opt_out: prefs.email_alert_opt_out ?? false,
    };

    if (!prefMap[type as AlertType]) {
      return NextResponse.json({ ok: false, error: `${type} email alerts disabled` });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
    const userName = userData.full_name || 'there';

    // Build template based on type
    let template;
    switch (type as AlertType) {
      case 'new_message':
        template = newMessageAlertEmail(
          userName,
          leadName || leadPhone || 'a contact',
          message || '(no preview)',
          `${baseUrl}/texts`
        );
        break;
      case 'appointment':
        template = appointmentAlertEmail(
          userName,
          leadName || leadPhone || 'a contact',
          appointmentTime || 'Time TBD',
          `${baseUrl}/appointments`
        );
        break;
      case 'low_credits':
        template = lowCreditsAlertEmail(
          userName,
          currentCredits ?? 0,
          `${baseUrl}/points`
        );
        break;
      case 'opt_out':
        template = optOutAlertEmail(
          userName,
          leadName || '',
          leadPhone || '',
          `${baseUrl}/settings?tab=dnc`
        );
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown alert type: ${type}` }, { status: 400 });
    }

    const FROM_EMAIL = (process.env.SERVICE_EMAIL_FROM || 'noreply@hyvewyre.com').trim();
    const FROM_NAME = (process.env.SERVICE_EMAIL_FROM_NAME || 'HyveWyre').trim();

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: userData.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Email alert error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

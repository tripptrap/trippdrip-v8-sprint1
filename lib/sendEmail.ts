import nodemailer from 'nodemailer';

/**
 * The one place email actually gets sent (#79).
 *
 * This logic used to live inside `app/api/notifications/email-alert/route.ts`,
 * which made it unreachable from anywhere that isn't an authenticated HTTP
 * request — so `notifyAdmins()` could not escalate a "customer paid and got
 * nothing" alert beyond the in-app notification bell without an internal fetch
 * to itself. Both the route and the alerting path now call this.
 */

const FROM_EMAIL = () => (process.env.SERVICE_EMAIL_FROM || 'noreply@hyvewyre.com').trim();
const FROM_NAME = () => (process.env.SERVICE_EMAIL_FROM_NAME || 'HyveWyre').trim();

/**
 * Build a transport for whichever provider is configured.
 *
 * Throws rather than returning a broken transport: a misconfiguration should
 * say so once, not fail per-send with an opaque SMTP error.
 */
export function createTransporter() {
  // .trim() matters: several production env values carry a trailing newline,
  // and this is an exact string comparison — 'sendgrid\n' silently falls
  // through to the SMTP branch, which has no credentials configured, so email
  // fails with no error anyone sees (#85).
  const provider = (process.env.SERVICE_EMAIL_PROVIDER || 'smtp').trim();

  if (provider === 'sendgrid') {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('Email is not configured: SERVICE_EMAIL_PROVIDER is "sendgrid" but SENDGRID_API_KEY is unset.');
    }
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }

  // Reached whenever the provider isn't sendgrid. Without credentials this
  // would build a transport pointing at smtp.gmail.com with no auth, which
  // fails per-send with an opaque error rather than saying the app is
  // misconfigured. In production SMTP_* are all unset (#84), so this branch is
  // only correct if someone has deliberately configured SMTP.
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

/**
 * True when a send could actually succeed. Lets a caller decide whether to
 * bother, and — more usefully — lets an escalation path say "this alert has
 * nowhere to go" instead of silently doing nothing.
 */
export function isEmailConfigured(): boolean {
  try {
    createTransporter();
    return true;
  } catch {
    return false;
  }
}

/**
 * Send one email. Never throws — returns `{ ok: false, error }` instead.
 *
 * Callers are generally already handling a failure of their own (a charge that
 * didn't fulfil, a cron that died); throwing from the notification would
 * replace a specific problem with a vaguer one.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (recipients.length === 0) return { ok: false, error: 'No recipients' };

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `${FROM_NAME()} <${FROM_EMAIL()}>`,
      to: recipients.join(', '),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to send email' };
  }
}

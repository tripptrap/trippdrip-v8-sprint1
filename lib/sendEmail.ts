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
    // .trim() on the key as well as the provider. Production's SENDGRID_API_KEY
    // carries a trailing newline (#85), and unlike an HTTP header — where curl
    // and fetch strip it — SMTP AUTH base64-encodes the password verbatim, so
    // the newline goes over the wire and SendGrid answers:
    //   535 Authentication failed: the provided authorization grant is invalid,
    //   expired, or revoked
    // which reads as a dead key and is not one. Trimming every credential here
    // rather than relying on the value being clean (#101).
    const apiKey = (process.env.SENDGRID_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Email is not configured: SERVICE_EMAIL_PROVIDER is "sendgrid" but SENDGRID_API_KEY is unset.');
    }
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: apiKey },
    });
  }

  // Reached whenever the provider isn't sendgrid. Without credentials this
  // would build a transport pointing at smtp.gmail.com with no auth, which
  // fails per-send with an opaque error rather than saying the app is
  // misconfigured. In production SMTP_* are all unset (#84), so this branch is
  // only correct if someone has deliberately configured SMTP.
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASSWORD || '').trim();
  if (!smtpUser || !smtpPass) {
    throw new Error(
      `Email is not configured: SERVICE_EMAIL_PROVIDER is "${provider}", which needs ` +
      `SMTP_USER and SMTP_PASSWORD. Set those, or set SERVICE_EMAIL_PROVIDER=sendgrid ` +
      `with SENDGRID_API_KEY.`
    );
  }

  return nodemailer.createTransport({
    host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port: parseInt((process.env.SMTP_PORT || '587').trim()),
    secure: (process.env.SMTP_SECURE || '').trim() === 'true',
    auth: { user: smtpUser, pass: smtpPass },
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
  /** Where a human should reply. FROM_EMAIL is a noreply, so anything that
   *  expects an answer must set this or the answer is lost. */
  replyTo?: string;
  /** Message-ID of the message this answers, so it threads rather than starting
   *  a new conversation in the recipient's inbox. */
  inReplyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}): Promise<{ ok: boolean; error?: string; messageId?: string; accepted?: string[]; rejected?: string[]; response?: string }> {
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (recipients.length === 0) return { ok: false, error: 'No recipients' };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `${FROM_NAME()} <${FROM_EMAIL()}>`,
      to: recipients.join(', '),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      // References as well as In-Reply-To: some clients thread on one, some the
      // other, and a PIN that lands in a fresh thread is a PIN a human has to
      // match up by hand.
      ...(opts.inReplyTo ? { inReplyTo: opts.inReplyTo, references: [opts.inReplyTo] } : {}),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    });
    // `sendMail` resolving is not the same as the server taking the message.
    // Nodemailer resolves when at least one recipient is accepted, so a partly
    // or wholly rejected send could return ok:true and nobody would know — and
    // "did that email actually go?" is then unanswerable after the fact.
    //
    // info.response is the SMTP server's own reply, e.g. "250 2.0.0 Ok: queued
    // as 4X…". That string is the closest thing to proof this side of the
    // recipient's mailbox, so it is returned rather than discarded.
    const accepted: string[] = (info?.accepted ?? []).map((a: any) => (typeof a === 'string' ? a : a?.address)).filter(Boolean);
    const rejected: string[] = (info?.rejected ?? []).map((a: any) => (typeof a === 'string' ? a : a?.address)).filter(Boolean);

    if (accepted.length === 0) {
      return {
        ok: false,
        error: `The mail server accepted no recipients${rejected.length ? ` (rejected: ${rejected.join(', ')})` : ''}. ${info?.response ?? ''}`.trim(),
        rejected,
        response: info?.response,
      };
    }

    // Returned so callers that log deliveries keep their provider reference —
    // service_emails.message_id would otherwise go null.
    return { ok: true, messageId: info?.messageId, accepted, rejected, response: info?.response };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to send email' };
  }
}

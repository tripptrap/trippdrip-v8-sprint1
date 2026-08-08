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
 * Keep a copy of what we sent, in the mailbox it was sent from.
 *
 * ── Why this is not automatic ──────────────────────────────────────────────
 *
 * SMTP submission hands the message to the server and stops. Filling the Sent
 * folder is a separate IMAP APPEND that a mail *client* performs, so a
 * server-to-server send leaves no trace in the mailbox — support@hyvewyre.com
 * showed an empty Sent folder while mail was demonstrably being delivered, which
 * is exactly what it looks like when nothing is sending at all. Half an hour went
 * into telling those two states apart.
 *
 * It matters beyond diagnosis. This app emails carriers on customers' behalf with
 * their IRS documents attached. A queue id in a log that rotates is not a record
 * of compliance correspondence; the message itself is.
 *
 * ── Failure is deliberately silent to the caller ───────────────────────────
 *
 * The mail has already been accepted by the time this runs. Reporting an IMAP
 * problem as a send failure would make callers retry a message that went out —
 * for the OTP relay that means a second PIN request, and for verification a
 * duplicate at the carrier. So this logs and returns; it never throws upward.
 */
async function appendToSentFolder(raw: Buffer | string): Promise<void> {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || '').trim();
  if (!user || !pass) return;

  // Same host as SMTP unless told otherwise — for privateemail.com and most
  // hosts they are the same machine on a different port.
  const host = (process.env.IMAP_HOST || process.env.SMTP_HOST || '').trim();
  if (!host) return;
  const port = parseInt((process.env.IMAP_PORT || '993').trim(), 10);

  let client: any;
  try {
    const { ImapFlow } = await import('imapflow');
    client = new ImapFlow({
      host, port, secure: true,
      auth: { user, pass },
      // Its own logging is extremely chatty and this runs on every send.
      logger: false,
    });
    await client.connect();

    // Servers disagree about what Sent is called. Ask, rather than guessing and
    // silently creating a stray "Sent" alongside the real one.
    let mailbox = 'Sent';
    try {
      const list = await client.list();
      const found = list.find((m: any) =>
        m.specialUse === '\\Sent' || /^(sent|sent items|sent mail)$/i.test(m.path)
      );
      if (found?.path) mailbox = found.path;
    } catch { /* fall back to 'Sent' */ }

    await client.append(mailbox, raw, ['\\Seen']);
  } catch (err: any) {
    console.error('sendEmail: message sent but could not be copied to Sent:', err?.message || err);
  } finally {
    try { await client?.logout(); } catch { /* connection already gone */ }
  }
}

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
    const mail = {
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
    };

    const info = await transporter.sendMail(mail);
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

    // Copy to Sent, after the send and never in place of it. Compiled through a
    // throwaway stream transport because SMTP delivery does not hand back the
    // raw message, and re-composing it is the only way to get identical bytes.
    try {
      const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
      const built = await composer.sendMail(mail as any);
      if (built?.message) await appendToSentFolder(built.message as Buffer);
    } catch (err: any) {
      console.error('sendEmail: could not build a copy for Sent:', err?.message || err);
    }

    // Returned so callers that log deliveries keep their provider reference —
    // service_emails.message_id would otherwise go null.
    return { ok: true, messageId: info?.messageId, accepted, rejected, response: info?.response };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to send email' };
  }
}

import { createClient } from '@supabase/supabase-js';
import { getAdminEmails } from '@/lib/admin';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export type NotificationType =
  | 'new_message'
  | 'lead_reply'
  | 'opt_out'
  | 'low_credits'
  | 'appointment'
  | 'campaign_done'
  | 'ai_handoff'
  /** Operator alert: a customer paid and we failed to deliver (#78). */
  | 'fulfillment_failed'
  /** The account's 10DLC campaign is going unused and risks carrier dormancy (#136). */
  | 'registration_idle';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!supabaseAdmin) {
    console.error(`createNotification: no service-role client — dropped ${type} for ${userId}`);
    return false;
  }

  // supabase-js RESOLVES with { error }; it does not throw. The try/catch that
  // used to wrap this caught nothing, so a failed insert was reported as
  // success and the notification vanished silently. Check `error` explicitly.
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body: body || null,
    data: data || {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`createNotification failed (${type} for ${userId}):`, error);
    return false;
  }
  return true;
}

/**
 * Send an operator alert to every configured admin (#78).
 *
 * For things a customer experiences but only an operator can fix — a paid
 * number that never got ordered, most of all. Those paths previously did
 * nothing but `console.error`, which on Vercel means the only record is a log
 * line nobody reads.
 *
 * Failures here are logged loudly rather than swallowed: this is the alert of
 * last resort, so an alert that silently fails to send is worse than none —
 * it creates the impression something is watching when nothing is.
 */
export async function notifyAdmins(
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, any>,
  opts?: {
    /**
     * Also send email, not just the in-app notification (#79).
     *
     * Reserve this for alerts where **delay itself compounds the harm**: a card
     * charged with nothing delivered, a number live and billing with no owner
     * recorded, an opt-out that failed so every further send is a fresh
     * violation. An in-app alert waits for someone to log in, which for those is
     * the whole problem.
     *
     * Everything else stays in-app on purpose. A channel that fires for
     * everything gets muted, and then it is worse than not having it.
     */
    escalate?: boolean;
  }
): Promise<number> {
  const emails = getAdminEmails();
  if (emails.length === 0) {
    console.error(`🚨 ADMIN ALERT UNDELIVERABLE — ADMIN_EMAILS is not configured. ${title}: ${body ?? ''}`);
    return 0;
  }

  if (!supabaseAdmin) {
    console.error(`🚨 ADMIN ALERT UNDELIVERABLE — no service-role client. ${title}: ${body ?? ''}`);
    return 0;
  }

  // Sent before the in-app write and awaited independently, so an escalation
  // still goes out if the notifications insert fails — and vice versa. These are
  // two channels for the same alert, not one with a fallback.
  if (opts?.escalate) {
    await escalateByEmail(emails, title, body, data);
  }

  const { data: admins, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .in('email', emails);

  if (error || !admins?.length) {
    // The admin email may not correspond to a row in `users`. Say so loudly and
    // still emit the payload, so the log carries the full alert either way.
    console.error(
      `🚨 ADMIN ALERT UNDELIVERABLE — could not resolve ADMIN_EMAILS (${emails.join(', ')}) to users. ` +
        `${title}: ${body ?? ''}`,
      error ?? '(no matching rows)'
    );
    return 0;
  }

  let sent = 0;
  for (const admin of admins) {
    if (await createNotification(admin.id, type, title, body, data)) sent++;
  }

  if (sent === 0) {
    console.error(`🚨 ADMIN ALERT UNDELIVERABLE — every insert failed. ${title}: ${body ?? ''}`);
  }
  return sent;
}

/**
 * Email an operational alert to every ADMIN_EMAILS address (#79).
 *
 * **Deliberately ignores `user_preferences`.** The email-alert route honours
 * per-user toggles, which is right for "you have a new message" — but these are
 * operational alerts about real charges, and an operator turning off new-message
 * emails must not silently disable the one that says a customer paid and got
 * nothing. It also sends to the configured addresses directly rather than to
 * matched `users` rows, so it still works when an admin address has no account.
 *
 * Never throws: the caller is already handling a failure of its own.
 */
async function escalateByEmail(
  emails: string[],
  title: string,
  body?: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    const { sendEmail, isEmailConfigured } = await import('@/lib/sendEmail');
    const { fulfillmentFailedEmail } = await import('@/lib/emailTemplates');

    if (!isEmailConfigured()) {
      // Loud, because the alert that was meant to escalate has nowhere to go and
      // the operator would otherwise believe email escalation is working.
      console.error(
        `🚨 ADMIN EMAIL ESCALATION UNAVAILABLE — email is not configured, so this stayed in-app only. ${title}: ${body ?? ''}`
      );
      return;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com').trim();
    const template = fulfillmentFailedEmail(title, body ?? '', data ?? {}, `${baseUrl}/admin`);

    const sent = await sendEmail({
      to: emails,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (!sent.ok) {
      console.error(`🚨 ADMIN EMAIL ESCALATION FAILED (${sent.error}) — ${title}: ${body ?? ''}`);
    } else {
      console.log(`📧 Escalated to ${emails.length} admin address(es): ${title}`);
    }
  } catch (err: any) {
    console.error(`🚨 ADMIN EMAIL ESCALATION THREW — ${title}:`, err?.message || err);
  }
}

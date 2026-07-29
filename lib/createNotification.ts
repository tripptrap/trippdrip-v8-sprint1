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
  | 'fulfillment_failed';

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
  data?: Record<string, any>
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

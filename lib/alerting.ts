import { createClient } from '@supabase/supabase-js';
import { notifyAdmins, type NotificationType } from '@/lib/createNotification';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/** Long enough that a persistently broken cron alerts hourly, not every run. */
const DEFAULT_WINDOW_MINUTES = 60;

export type ThrottledAlertResult = 'sent' | 'throttled' | 'undeliverable';

/**
 * Alert admins at most once per window for a given key (#80, priority 3).
 *
 * `notifyAdmins()` is right for a one-off — a customer paid and we didn't
 * deliver. It is wrong for the cron routes, which run every 5–10 minutes: a
 * per-occurrence alert on something like "the RPC that fetches due messages is
 * failing" produces 288 identical notifications a day. An alert channel that
 * fires constantly gets muted, which costs more than having no channel at all.
 *
 * So these paths alert on the *first* occurrence in a window and suppress the
 * rest. The condition being reported is generally persistent (a broken RPC, a
 * database that is down), so the first alert carries the whole signal, and the
 * suppressed ones still go to the log with a 🔁 marker.
 *
 * The dedupe state lives in the notifications rows themselves — `data.alert_key`
 * — rather than in memory, because each cron invocation is a separate serverless
 * instance with nothing carried between runs.
 */
export async function alertAdminsThrottled(opts: {
  /** Stable identity of the condition, e.g. `cron_run_failed:process-drips`. */
  key: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
  type?: NotificationType;
  windowMinutes?: number;
}): Promise<ThrottledAlertResult> {
  const {
    key,
    title,
    body,
    data = {},
    type = 'fulfillment_failed',
    windowMinutes = DEFAULT_WINDOW_MINUTES,
  } = opts;

  if (!supabaseAdmin) {
    console.error(`🚨 ADMIN ALERT UNDELIVERABLE — no service-role client. ${title}: ${body ?? ''}`);
    return 'undeliverable';
  }

  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { data: recent, error } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('type', type)
    .gte('created_at', cutoff)
    .filter('data->>alert_key', 'eq', key)
    .limit(1);

  // A failed lookup must not swallow the alert — err towards sending. The worst
  // case is a duplicate notification; the alternative is losing the only signal
  // that something is broken.
  if (error) {
    console.error(`alertAdminsThrottled: could not check recent alerts for ${key}, sending anyway:`, error);
  } else if (recent && recent.length > 0) {
    console.error(`🔁 [${key}] still failing (alert already sent in the last ${windowMinutes}m): ${title} — ${body ?? ''}`);
    return 'throttled';
  }

  const sent = await notifyAdmins(type, title, body, { ...data, alert_key: key });
  return sent > 0 ? 'sent' : 'undeliverable';
}

import { createClient } from '@supabase/supabase-js';

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
  | 'ai_handoff';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, any>
) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body: body || null,
      data: data || {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('createNotification error:', err);
  }
}

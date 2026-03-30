import { sendTelnyxSMS } from '@/lib/telnyx';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createNotification, NotificationType } from '@/lib/createNotification';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type SmsAlertType = 'new_message' | 'low_credits' | 'opt_out';

export async function sendSmsAlertToUser(
  userId: string,
  type: SmsAlertType,
  context: { leadName?: string; leadPhone?: string; message?: string; threadId?: string } = {}
) {
  try {
    const supabase = createAdminClient(supabaseUrl, supabaseServiceKey);

    // Always create an in-app notification, regardless of SMS preferences
    const notifTypeMap: Record<SmsAlertType, NotificationType> = {
      new_message: 'new_message',
      low_credits: 'low_credits',
      opt_out: 'opt_out',
    };
    const { leadName, leadPhone, message, threadId } = context;
    let notifTitle = '';
    let notifBody: string | undefined;
    if (type === 'new_message') {
      notifTitle = `New message from ${leadName || leadPhone || 'a lead'}`;
      notifBody = message?.slice(0, 100);
    } else if (type === 'low_credits') {
      notifTitle = 'Running low on credits';
      notifBody = 'Top up to keep SMS features running.';
    } else if (type === 'opt_out') {
      notifTitle = `${leadName || leadPhone || 'A contact'} opted out`;
      notifBody = 'Added to your DNC list.';
    }
    createNotification(
      userId,
      notifTypeMap[type],
      notifTitle,
      notifBody,
      { leadPhone, threadId }
    ).catch(err => console.error('createNotification error in sendSmsAlertToUser:', err));

    // Get user's personal phone
    const { data: userData } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .single();

    if (!userData?.phone_number) return;

    // Check preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('sms_alerts_enabled, sms_alert_new_message, sms_alert_low_credits, sms_alert_opt_out')
      .eq('user_id', userId)
      .single();

    if (!prefs?.sms_alerts_enabled) return;
    if (type === 'new_message' && !prefs.sms_alert_new_message) return;
    if (type === 'low_credits' && !prefs.sms_alert_low_credits) return;
    if (type === 'opt_out' && !prefs.sms_alert_opt_out) return;

    // Get primary Telnyx number
    const { data: telnyxNum } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single();

    // Build message
    let alertBody = '';
    if (type === 'new_message') {
      const preview = message ? ` — "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"` : '';
      alertBody = `HyveWyre: New reply from ${leadName || leadPhone || 'a lead'}${preview}. Open the app to respond.`;
    } else if (type === 'low_credits') {
      alertBody = `HyveWyre: You're running low on credits. Top up to keep SMS flowing.`;
    } else if (type === 'opt_out') {
      alertBody = `HyveWyre: ${leadName || leadPhone || 'A contact'} opted out (STOP) and was added to your DNC list.`;
    }

    await sendTelnyxSMS({
      to: userData.phone_number,
      message: alertBody,
      from: telnyxNum?.phone_number,
    });
  } catch (err) {
    console.error('sendSmsAlertToUser error:', err);
  }
}

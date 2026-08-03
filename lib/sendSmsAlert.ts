import { sendTelnyxSMS } from '@/lib/telnyx';
import { exemptFromModeration } from '@/lib/smsModeration';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createNotification, NotificationType } from '@/lib/createNotification';
import { sendEmail } from '@/lib/sendEmail';
import {
  newMessageAlertEmail,
  lowCreditsAlertEmail,
  optOutAlertEmail,
  appointmentAlertEmail,
} from '@/lib/emailTemplates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type SmsAlertType = 'new_message' | 'low_credits' | 'opt_out' | 'appointment';


export async function sendSmsAlertToUser(
  userId: string,
  type: SmsAlertType,
  context: { leadName?: string; leadPhone?: string; message?: string; threadId?: string; appointmentTime?: string; currentCredits?: number } = {}
) {
  try {
    const supabase = createAdminClient(supabaseUrl, supabaseServiceKey);

    // Always create an in-app notification, regardless of SMS/email preferences
    const notifTypeMap: Partial<Record<SmsAlertType, NotificationType>> = {
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
    const notifType = notifTypeMap[type];
    if (notifType) {
      createNotification(
        userId,
        notifType,
        notifTitle,
        notifBody,
        { leadPhone, threadId }
      ).catch(err => console.error('createNotification error in sendSmsAlertToUser:', err));
    }

    // Fetch user profile + preferences in parallel
    const [userRes, prefsRes] = await Promise.all([
      supabase.from('users').select('phone_number, email, full_name').eq('id', userId).single(),
      supabase.from('user_preferences')
        .select('sms_alerts_enabled, sms_alert_new_message, sms_alert_low_credits, sms_alert_opt_out, email_alerts_enabled, email_alert_new_message, email_alert_low_credits, email_alert_opt_out, email_alert_appointment')
        .eq('user_id', userId)
        .single(),
    ]);

    const userData = userRes.data;
    const prefs = prefsRes.data;

    // ── SMS Alert ─────────────────────────────────────────────────────────────
    if (userData?.phone_number && prefs?.sms_alerts_enabled) {
      const smsEnabled =
        (type === 'new_message' && (prefs.sms_alert_new_message ?? true)) ||
        (type === 'low_credits' && (prefs.sms_alert_low_credits ?? true)) ||
        (type === 'opt_out' && (prefs.sms_alert_opt_out ?? false)) ||
        type === 'appointment';

      if (smsEnabled) {
        const { data: telnyxNum } = await supabase
          .from('user_telnyx_numbers')
          .select('phone_number')
          .eq('user_id', userId)
          .eq('is_primary', true)
          .single();

        let alertBody = '';
        if (type === 'new_message') {
          const preview = message ? ` — "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"` : '';
          alertBody = `HyveWyre: New reply from ${leadName || leadPhone || 'a lead'}${preview}. Open the app to respond.`;
        } else if (type === 'low_credits') {
          alertBody = `HyveWyre: You're running low on credits. Top up to keep SMS flowing.`;
        } else if (type === 'opt_out') {
          alertBody = `HyveWyre: ${leadName || leadPhone || 'A contact'} opted out (STOP) and was added to your DNC list.`;
        } else if (type === 'appointment') {
          alertBody = `HyveWyre: Appointment booked with ${leadName || leadPhone || 'a lead'}${context.appointmentTime ? ` — ${context.appointmentTime}` : ''}. Check your calendar.`;
        }

        // Explicit, because `telnyxNum` comes from an untyped query — `any`
        // slips past the required `from` (#125). Without a number we skip the
        // SMS rather than let the transport refuse it opaquely; the email
        // branch below still runs, so the alert is not lost.
        const alertFrom: string | undefined = telnyxNum?.phone_number;
        if (alertBody && !alertFrom) {
          console.warn(`SMS alert skipped for ${userId}: no active number to send from`);
        } else if (alertBody && alertFrom) {
          await sendTelnyxSMS({
            to: userData.phone_number,
            message: alertBody,
            from: alertFrom,
            // The account owner's own phone — see /api/notifications/sms-alert (#123).
            moderation: exemptFromModeration('account_alert'),
          }).catch(err => console.error('SMS alert send failed:', err));
        }
      }
    }

    // ── Email Alert ──────────────────────────────────────────────────────────
    if (userData?.email && prefs?.email_alerts_enabled) {
      const emailEnabled =
        (type === 'new_message' && (prefs.email_alert_new_message ?? true)) ||
        (type === 'low_credits' && (prefs.email_alert_low_credits ?? true)) ||
        (type === 'opt_out' && (prefs.email_alert_opt_out ?? false)) ||
        (type === 'appointment' && (prefs.email_alert_appointment ?? true));

      if (emailEnabled) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
        const userName = userData.full_name || 'there';
        let template;

        if (type === 'new_message') {
          template = newMessageAlertEmail(userName, leadName || leadPhone || 'a contact', message || '(no preview)', `${baseUrl}/texts`);
        } else if (type === 'low_credits') {
          template = lowCreditsAlertEmail(userName, context.currentCredits ?? 0, `${baseUrl}/points`);
        } else if (type === 'opt_out') {
          template = optOutAlertEmail(userName, leadName || '', leadPhone || '', `${baseUrl}/settings?tab=dnc`);
        } else if (type === 'appointment') {
          template = appointmentAlertEmail(userName, leadName || leadPhone || 'a contact', context.appointmentTime || 'Time TBD', `${baseUrl}/appointments`);
        }

        if (template) {
          // lib/sendEmail.ts rather than a fifth copy of the transporter. The
          // copy this replaced passed SENDGRID_API_KEY and the SMTP credentials
          // through untrimmed, which is what made a perfectly valid key look
          // revoked (#101) — SMTP AUTH sends the password verbatim, and unlike
          // an HTTP header nothing strips the trailing newline.
          const sent = await sendEmail({
            to: userData.email,
            subject: template.subject,
            text: template.text,
            html: template.html,
          });
          if (!sent.ok) console.error('Email alert send failed:', sent.error);
        }
      }
    }
  } catch (err) {
    console.error('sendSmsAlertToUser error:', err);
  }
}

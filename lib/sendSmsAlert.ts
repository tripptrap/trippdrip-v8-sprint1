import { sendTelnyxSMS } from '@/lib/telnyx';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createNotification, NotificationType } from '@/lib/createNotification';
import nodemailer from 'nodemailer';
import {
  newMessageAlertEmail,
  lowCreditsAlertEmail,
  optOutAlertEmail,
  appointmentAlertEmail,
} from '@/lib/emailTemplates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type SmsAlertType = 'new_message' | 'low_credits' | 'opt_out' | 'appointment';

function createEmailTransporter() {
  const provider = process.env.SERVICE_EMAIL_PROVIDER || 'smtp';
  if (provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

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

        if (alertBody) {
          await sendTelnyxSMS({
            to: userData.phone_number,
            message: alertBody,
            from: telnyxNum?.phone_number,
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
          const FROM_EMAIL = process.env.SERVICE_EMAIL_FROM || 'noreply@hyvewyre.com';
          const FROM_NAME = process.env.SERVICE_EMAIL_FROM_NAME || 'HyveWyre';
          const transporter = createEmailTransporter();
          await transporter.sendMail({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: userData.email,
            subject: template.subject,
            text: template.text,
            html: template.html,
          }).catch(err => console.error('Email alert send failed:', err));
        }
      }
    }
  } catch (err) {
    console.error('sendSmsAlertToUser error:', err);
  }
}

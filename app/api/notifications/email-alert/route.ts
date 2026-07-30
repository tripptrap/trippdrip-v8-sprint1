import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/sendEmail';
import {
  newMessageAlertEmail,
  appointmentAlertEmail,
  lowCreditsAlertEmail,
  optOutAlertEmail,
} from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

type AlertType = 'new_message' | 'appointment' | 'low_credits' | 'opt_out';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Also allow system calls (cron/webhooks) with API key
    const apiKey = req.headers.get('x-api-key');
    const isSystemCall = apiKey && apiKey === process.env.SYSTEM_API_KEY?.trim();

    if (!user && !isSystemCall) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { type, userId, leadName, leadPhone, message, appointmentTime, currentCredits } = await req.json();

    // Resolve which user we're alerting
    const targetUserId = userId || user?.id;
    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: 'Missing userId' }, { status: 400 });
    }

    // A system call carries no session, so the request-scoped client reads as
    // anon and RLS returns nothing — which surfaced as "No email address on
    // file" for a user who plainly has one. The x-api-key gate above is what
    // authorises this path, so the lookups must run with service-role rights
    // or the system path can never work at all.
    const db = isSystemCall ? createServiceRoleClient() : supabase;

    // Get user's email and preferences
    const { data: userData } = await db
      .from('users')
      .select('email, full_name')
      .eq('id', targetUserId)
      .single();

    const { data: prefs } = await db
      .from('user_preferences')
      .select('email_alerts_enabled, email_alert_new_message, email_alert_low_credits, email_alert_opt_out, email_alert_appointment')
      .eq('user_id', targetUserId)
      .single();

    if (!userData?.email) {
      return NextResponse.json({ ok: false, error: 'No email address on file' });
    }

    if (!prefs?.email_alerts_enabled) {
      return NextResponse.json({ ok: false, error: 'Email alerts disabled' });
    }

    // Check per-type preference
    const prefMap: Record<AlertType, boolean> = {
      new_message: prefs.email_alert_new_message ?? true,
      appointment: prefs.email_alert_appointment ?? true,
      low_credits: prefs.email_alert_low_credits ?? true,
      opt_out: prefs.email_alert_opt_out ?? false,
    };

    if (!prefMap[type as AlertType]) {
      return NextResponse.json({ ok: false, error: `${type} email alerts disabled` });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
    const userName = userData.full_name || 'there';

    // Build template based on type
    let template;
    switch (type as AlertType) {
      case 'new_message':
        template = newMessageAlertEmail(
          userName,
          leadName || leadPhone || 'a contact',
          message || '(no preview)',
          `${baseUrl}/texts`
        );
        break;
      case 'appointment':
        template = appointmentAlertEmail(
          userName,
          leadName || leadPhone || 'a contact',
          appointmentTime || 'Time TBD',
          `${baseUrl}/appointments`
        );
        break;
      case 'low_credits':
        template = lowCreditsAlertEmail(
          userName,
          currentCredits ?? 0,
          `${baseUrl}/points`
        );
        break;
      case 'opt_out':
        template = optOutAlertEmail(
          userName,
          leadName || '',
          leadPhone || '',
          `${baseUrl}/settings?tab=dnc`
        );
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown alert type: ${type}` }, { status: 400 });
    }

    // Transport, from-address and the SMTP-misconfiguration guard now live in
    // lib/sendEmail.ts so notifyAdmins() can reach them too (#79).
    const sent = await sendEmail({
      to: userData.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (!sent.ok) {
      console.error('Email alert send failed:', sent.error);
      return NextResponse.json({ ok: false, error: sent.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Email alert error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

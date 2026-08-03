import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/sendEmail';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { secureCompare } from '@/lib/cronAuth';
import {
  welcomeEmail,
  passwordResetEmail,
  emailVerificationEmail,
  lowPointsWarningEmail,
  campaignCompletedEmail,
  monthlySummaryEmail,
  accountSuspendedEmail,
  accountBannedEmail,
  paymentFailedEmail,
  EmailTemplate
} from '@/lib/emailTemplates';



type ServiceEmailType =
  | 'welcome'
  | 'password_reset'
  | 'email_verification'
  | 'low_points_warning'
  | 'campaign_completed'
  | 'monthly_summary'
  | 'account_suspended'
  | 'account_banned'
  | 'payment_failed';

type ServiceEmailData = {
  type: ServiceEmailType;
  to: string;
  data: any;
};

export async function POST(req: NextRequest) {
  try {
    // ── Why a logged-in session is not enough (audit, 2026-08-03) ─────────────
    //
    // This route used to accept `user || apiKey`. Middleware does not run on
    // /api/*, so that check was the whole gate, and **any** Supabase session —
    // including the unpaid signups anyone can create — could POST:
    //
    //   { type: 'password_reset', to: <anyone>, data: { resetUrl: <attacker> } }
    //
    // The mail then leaves support@hyvewyre.com with SPF and DKIM passing and
    // full HyveWyre branding: credential phishing of our own customers, from
    // our own domain, and a fast route to that mailbox being blacklisted —
    // which would take every transactional and alerting email with it.
    //
    // No caller ever needed the session branch. All four are server-side and
    // already send the key (lib/serviceEmail.ts:78, admin/users/action ×3), so
    // the key is now the only way in. `to` and `data.resetUrl` still come from
    // the body — that is fine once the caller is provably ours, and is the
    // reason the gate has to be airtight.
    const expected = process.env.SYSTEM_API_KEY?.trim();
    const provided = req.headers.get('x-api-key')?.trim();
    if (!expected || !provided || !secureCompare(provided, expected)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Nothing here runs as the recipient, so service_role is correct: the
    // caller is our own server, and the write below is an audit log.
    const supabase = createServiceRoleClient();

    const body: ServiceEmailData = await req.json();
    const { type, to, data } = body;

    if (!type || !to) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: type, to' },
        { status: 400 }
      );
    }

    // Generate email template based on type
    let template: EmailTemplate;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';

    switch (type) {
      case 'welcome':
        template = welcomeEmail(
          data.userName || 'there',
          data.loginUrl || `${baseUrl}/dashboard`
        );
        break;

      case 'password_reset':
        template = passwordResetEmail(
          data.userName || 'there',
          data.resetUrl,
          data.expiresIn || '1 hour'
        );
        break;

      case 'email_verification':
        template = emailVerificationEmail(
          data.userName || 'there',
          data.verifyUrl
        );
        break;

      case 'low_points_warning':
        template = lowPointsWarningEmail(
          data.userName || 'there',
          data.currentPoints || 0,
          `${baseUrl}/dashboard`
        );
        break;

      case 'campaign_completed':
        template = campaignCompletedEmail(
          data.userName || 'there',
          data.campaignName,
          data.stats || { sent: 0, delivered: 0, failed: 0 },
          `${baseUrl}/dashboard`
        );
        break;

      case 'monthly_summary':
        template = monthlySummaryEmail(
          data.userName || 'there',
          data.stats || { messagesSent: 0, leadsAdded: 0, conversationsStarted: 0, responseRate: 0 },
          `${baseUrl}/dashboard`
        );
        break;

      case 'account_suspended':
        template = accountSuspendedEmail(
          data.userName || 'there',
          data.reason || 'Violation of terms of service',
          `${baseUrl}/contact`,
          data.suspendedUntil || undefined
        );
        break;

      case 'account_banned':
        template = accountBannedEmail(
          data.userName || 'there',
          data.reason || 'Violation of terms of service',
          `${baseUrl}/contact`
        );
        break;

      case 'payment_failed':
        template = paymentFailedEmail(
          data.userName || 'there',
          data.amount || 0,
          data.retryUrl || `${baseUrl}/points`
        );
        break;

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown email type: ${type}` },
          { status: 400 }
        );
    }

    // Send via lib/sendEmail.ts rather than a fourth copy of the transporter.
    // The copy this replaced passed SENDGRID_API_KEY straight through, and
    // production's value carries a trailing newline — SMTP AUTH sends the
    // password verbatim, so SendGrid rejects it as an invalid grant (#101).
    // Who this went to. The old code took the id off the caller's session, so
    // it only ever filled in when a human's browser hit the route — i.e. never
    // for the four real callers, which are all server-side. `service_emails`
    // holds 0 rows with a user_id to show for it. Resolving from the recipient
    // is both correct (a service email is *about* its recipient, not its
    // sender) and works for the callers that actually exist. Stays null for a
    // recipient with no account, which the column allows.
    const recipient = Array.isArray(to) ? to[0] : to;
    const { data: recipientUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', recipient)
      .maybeSingle();

    const logSend = async (fields: Record<string, unknown>) => {
      const { error } = await supabase.from('service_emails').insert({
        user_id: recipientUser?.id ?? null,
        email_type: type,
        recipient,
        subject: template.subject,
        sent_at: new Date().toISOString(),
        ...fields,
      });
      // supabase-js returns { error }, it does not throw. Log-only, so a
      // failure here must never take down the send that already succeeded.
      if (error) console.error('service_emails insert failed:', error);
    };

    try {
      const sent = await sendEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
      if (!sent.ok) throw new Error(sent.error || 'Failed to send email');
      const info = { messageId: sent.messageId ?? null };

      await logSend({ status: 'sent', message_id: info.messageId });

      return NextResponse.json({
        ok: true,
        messageId: info.messageId,
        type,
      });
    } catch (error: any) {
      console.error('Error sending service email:', error);

      await logSend({ status: 'failed', error: error.message });

      return NextResponse.json(
        { ok: false, error: `Failed to send email: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in service email route:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

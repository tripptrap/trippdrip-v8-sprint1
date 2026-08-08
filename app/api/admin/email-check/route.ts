import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/sendEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// "Did that email actually send?" — answerable, at last.
//
// sendEmail used to return ok:true whenever nodemailer did not throw, and
// discarded the SMTP server's own reply. So after sending something that mattered
// there was no evidence either way short of asking the recipient. This sends a
// test to the configured admin address and returns exactly what the mail server
// said, including the queue id.
//
// Admin-only, and it emails ADMIN_EMAILS rather than any address in the request —
// an open "send mail and tell me the response" endpoint is a spam relay.

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) {
    return NextResponse.json({ ok: false, error: 'ADMIN_EMAILS is not set' }, { status: 400 });
  }
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    return NextResponse.json({ ok: false, error: 'Not an admin' }, { status: 403 });
  }

  const stamp = new Date().toISOString();
  const result = await sendEmail({
    to: admins[0],
    subject: `HyveWyre mail check — ${stamp}`,
    text: `Sent from the deployed app at ${stamp}.\n\nIf this arrived, outbound mail from support@hyvewyre.com is working.`,
    html: `<p>Sent from the deployed app at ${stamp}.</p><p>If this arrived, outbound mail from support@hyvewyre.com is working.</p>`,
  });

  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    sentTo: admins[0],
    // The evidence: the SMTP server's own words.
    smtpResponse: result.response,
    accepted: result.accepted,
    rejected: result.rejected,
    messageId: result.messageId,
  });
}

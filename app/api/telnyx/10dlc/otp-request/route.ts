import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requestOtpPin } from '@/lib/soleProprietorOtp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Asks Telnyx to issue the sole-proprietor OTP PIN, on the user's behalf.
//
// Replaces an earlier route that only recorded the user had emailed Telnyx
// themselves. Doing it for them is the difference between a step someone has to
// understand and a button — but it also means this route transmits their IRS
// letter to a third party, so consent is captured here and checked again in the
// relay itself.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Consent is recorded before the send is attempted, and only when explicitly
  // given. Uploading a document to your own account is not agreement to forward
  // it — a tick that defaults to on would make this meaningless.
  if (body?.consent === true) {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('user_10dlc_registrations')
      .update({ otp_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  const result = await requestOtpPin(user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sentToTelnyx: result.sentToTelnyx,
    message: result.sentToTelnyx
      ? 'Requested. Telnyx will text the PIN to your mobile — enter it below when it arrives. It expires 24 hours after they send it.'
      : 'Your request has been prepared and sent to our team to pass on. You will get a text with your PIN once it reaches the carrier.',
  });
}

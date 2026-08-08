import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Records that a sole proprietor has emailed Telnyx for their OTP PIN.
//
// Nothing else can know this. The request is an email the user sends to
// 10dlcquestions@telnyx.com, outside anything we can observe — so without this
// the app cannot tell a brand waiting on a human from one waiting on TCR, which
// is the same overloaded-status problem as #190 and produces the same wrong
// message.
//
// What it buys, concretely: Telnyx allow 24 hours to reply once the PIN is sent,
// and a deadline nobody is shown is a deadline people miss. Stamping the request
// lets the UI show the clock and lets us say "your PIN should have arrived" when
// it has not.
//
// Deliberately self-reported. Automating the email would hide the one step the
// user must personally act on — the PIN arrives on their phone, and only they
// can send it back.

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: reg, error: readError } = await admin
    .from('user_10dlc_registrations')
    .select('id, entity_type, brand_id, brand_status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  if (!reg?.brand_id) {
    return NextResponse.json(
      { ok: false, error: 'Register your business first — there is no brand for Telnyx to send a PIN for.' },
      { status: 400 }
    );
  }

  // Only sole proprietors have this step. Accepting it for anyone else would
  // stamp a timestamp that implies a verification route their brand does not
  // use, and someone would later read it as evidence the step was done.
  if (reg.entity_type !== 'SOLE_PROPRIETOR') {
    return NextResponse.json(
      { ok: false, error: 'Only sole proprietor registrations use the OTP step.' },
      { status: 400 }
    );
  }

  if (reg.brand_status === 'verified') {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const requestedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from('user_10dlc_registrations')
    .update({ otp_requested_at: requestedAt, updated_at: requestedAt })
    .eq('id', reg.id);

  // Checked, not assumed — supabase-js returns { error } rather than throwing,
  // and a silently-failed write here would leave the user believing a deadline
  // is being tracked when nothing recorded it.
  if (updateError) {
    console.error('OTP request stamp failed:', updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    otpRequestedAt: requestedAt,
    // The window Telnyx allow for the reply, so the client does not have to
    // hardcode a number that lives in their process rather than ours.
    replyWindowHours: 24,
  });
}

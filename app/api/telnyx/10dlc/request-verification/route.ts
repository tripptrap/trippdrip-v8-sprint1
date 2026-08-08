import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requestBrandVerification } from '@/lib/soleProprietorOtp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sends the account holder's IRS CP 575 to the carrier to unstick an UNVERIFIED
// brand. User-initiated, one message, about their own registration.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Consent recorded here, checked again in the library — the library is what
  // actually attaches the file to an outbound message.
  if (body?.consent === true) {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('user_10dlc_registrations')
      .update({ otp_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const result = await requestBrandVerification(user.id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    message: 'Your EIN letter has been sent to the carrier. They usually reply within a business day.',
  });
}

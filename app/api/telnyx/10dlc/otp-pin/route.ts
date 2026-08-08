import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { relayOtpPin } from '@/lib/soleProprietorOtp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Relays the PIN the customer received by SMS back to Telnyx.
//
// The PIN never reaches us any other way — Telnyx text it to the person's own
// mobile, which is the point of it. So this is the one step the user genuinely
// has to perform, reduced to typing what their phone shows them.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  if (!pin.trim()) {
    return NextResponse.json({ ok: false, error: 'Enter the PIN Telnyx texted you.', field: 'pin' }, { status: 400 });
  }

  const result = await relayOtpPin(user.id, pin);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, field: 'pin' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sentToTelnyx: result.sentToTelnyx,
    message: result.sentToTelnyx
      ? 'PIN sent. Verification usually completes within a business day — this page updates on its own.'
      : 'PIN received and passed to our team to forward.',
  });
}

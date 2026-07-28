import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error } = await adminClient
      .from('users')
      .select('account_status, suspension_reason, suspended_until')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !userData) {
      // No user row found — return active (default). Deliberate: this makes a
      // non-existent email indistinguishable from an active one, so the endpoint
      // can't be used to enumerate accounts.
      return NextResponse.json({ status: 'active', reason: null, suspended_until: null });
    }

    // Never return `suspension_reason` here (#48). This endpoint is called from
    // the login page *after* a failed sign-in — a banned user can never
    // authenticate, so there is no way to prove the caller owns this address
    // before answering. That means anyone who guesses an email would otherwise
    // read the admin's free-text reason, which can contain candid internal notes
    // ("suspected fraud", "carrier spam complaints").
    //
    // The status and end date are still returned: the user has to be told why
    // their login failed, and those reveal far less than the reason text. The
    // specifics are support's to give out, once they can verify identity.
    const status = userData.account_status || 'active';
    const isRestricted = status === 'banned' || status === 'suspended';

    return NextResponse.json({
      status,
      reason: isRestricted
        ? 'Please contact support for details about your account.'
        : null,
      suspended_until: userData.suspended_until || null,
    });
  } catch (error: any) {
    console.error('Account status check error:', error);
    return NextResponse.json({ status: 'active', reason: null, suspended_until: null });
  }
}

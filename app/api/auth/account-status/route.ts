import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { limitByIp } from '@/lib/rateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * The login page calls this once per failed sign-in, so a real person hits it a
 * handful of times at worst — even fumbling a password repeatedly stays well
 * under this. Shared office IPs have room too (#58).
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

export async function POST(req: NextRequest) {
  try {
    // Before anything else, including reading the body. This endpoint answers an
    // unauthenticated caller about an arbitrary email using the service-role key,
    // so an unthrottled caller could probe a list of addresses to find which are
    // restricted — and get a free unauthenticated read against `users` each time.
    // Checking first means a throttled caller costs one cheap counter upsert
    // instead of a lookup (#58).
    const limited = await limitByIp(req, 'account-status', RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (limited) return limited;

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // `suspension_reason` is deliberately not selected: it is never returned
    // (#48), and fetching a field this endpoint must not disclose only invites
    // someone to add it back to the response later.
    const { data: userData, error } = await adminClient
      .from('users')
      .select('account_status, suspended_until')
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

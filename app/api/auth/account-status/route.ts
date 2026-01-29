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
      // No user row found — return active (default)
      return NextResponse.json({ status: 'active', reason: null, suspended_until: null });
    }

    return NextResponse.json({
      status: userData.account_status || 'active',
      reason: userData.suspension_reason || null,
      suspended_until: userData.suspended_until || null,
    });
  } catch (error: any) {
    console.error('Account status check error:', error);
    return NextResponse.json({ status: 'active', reason: null, suspended_until: null });
  }
}

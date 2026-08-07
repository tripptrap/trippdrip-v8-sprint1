import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { syncTenDlcRegistration, type TenDlcRegistrationRow } from '@/lib/tenDlcSync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/** Re-checks live Telnyx status for the user's brand/campaign and syncs the DB row. */
export async function POST() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured (missing service role key)' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: registration } = await supabaseAdmin
      .from('user_10dlc_registrations')
      .select('id, user_id, brand_id, brand_status, campaign_id, campaign_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ ok: false, error: 'No registration found' }, { status: 404 });
    }

    // The sync itself lives in lib/tenDlcSync so this button and
    // /api/cron/refresh-10dlc cannot drift apart. This route is now just auth +
    // "which registration", which is the only part that differs between them.
    await syncTenDlcRegistration(supabaseAdmin, registration as TenDlcRegistrationRow);

    const { data: fresh } = await supabaseAdmin
      .from('user_10dlc_registrations')
      .select('*')
      .eq('id', registration.id)
      .single();

    return NextResponse.json({ ok: true, registration: fresh });
  } catch (error: any) {
    console.error('Error in POST /api/telnyx/10dlc/refresh:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

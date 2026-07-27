import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { assignNumberToCampaign, getCampaignStatus } from '@/lib/telnyx10dlc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Links the user's primary phone number to their approved 10DLC campaign.
 * Re-checks the campaign's live status first — assignment only makes sense
 * once Telnyx has actually marked the campaign ACTIVE.
 */
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
      .select('id, campaign_id, campaign_status, assigned_phone_number')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!registration?.campaign_id) {
      return NextResponse.json({ ok: false, error: 'No campaign found — register your business first.' }, { status: 400 });
    }
    if (registration.assigned_phone_number) {
      return NextResponse.json({ ok: false, error: 'A number is already assigned to this campaign.' }, { status: 409 });
    }

    // Re-check live status — don't trust a possibly-stale campaign_status column
    const statusResult = await getCampaignStatus(registration.campaign_id);
    if (!statusResult.success || statusResult.status !== 'ACTIVE') {
      return NextResponse.json({
        ok: false,
        error: `Campaign is not active yet (status: ${statusResult.status || 'unknown'}). Check back once Telnyx approves it.`,
      }, { status: 409 });
    }

    const { data: primaryNumber } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (!primaryNumber?.phone_number) {
      return NextResponse.json({ ok: false, error: 'No primary phone number found on your account.' }, { status: 400 });
    }

    const assignResult = await assignNumberToCampaign(primaryNumber.phone_number, registration.campaign_id);
    if (!assignResult.success) {
      return NextResponse.json({ ok: false, error: assignResult.error }, { status: 502 });
    }

    await supabaseAdmin.from('user_10dlc_registrations').update({
      campaign_status: 'active',
      assigned_phone_number: primaryNumber.phone_number,
      updated_at: new Date().toISOString(),
    }).eq('id', registration.id);

    return NextResponse.json({ ok: true, assignedPhoneNumber: primaryNumber.phone_number });
  } catch (error: any) {
    console.error('Error in POST /api/telnyx/10dlc/assign-number:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

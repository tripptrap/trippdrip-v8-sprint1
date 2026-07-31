import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  getBrandStatus, getCampaignStatus, mapBrandStatus, mapCampaignStatus,
  listCampaignsForBrand, pickUsableCampaign,
} from '@/lib/telnyx10dlc';
import { assignAllUserNumbersToCampaign } from '@/lib/autoAssignCampaignNumber';

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
      .select('id, brand_id, brand_status, campaign_id, campaign_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ ok: false, error: 'No registration found' }, { status: 404 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (registration.brand_id && registration.brand_status === 'pending') {
      const brandResult = await getBrandStatus(registration.brand_id);
      if (brandResult.success) {
        updates.brand_status = mapBrandStatus(brandResult.status);
      }
    }

    // Re-check whenever the campaign is not already usable. This used to run
    // only while status === 'pending', which meant a campaign that had gone
    // 'failed' was never looked at again — and 'failed' includes EXPIRED, the
    // state a superseded campaign lands in (#1).
    if (registration.campaign_id && registration.campaign_status !== 'active') {
      const campaignResult = await getCampaignStatus(registration.campaign_id);
      if (campaignResult.success) {
        updates.campaign_status = mapCampaignStatus(campaignResult.status);
        updates.campaign_failure_reason = campaignResult.failureReasons?.join(' | ') || null;
      }
    }

    // The stored campaign is dead (or was never set) — see whether the brand has
    // a live one and adopt it.
    //
    // Telnyx does not update a campaign id when a rejected campaign is
    // resubmitted; it issues a new one and leaves the old id resolving happily
    // as EXPIRED. So the app can sit on a pointer to a corpse while a perfectly
    // good campaign exists under the same brand, which is precisely the state
    // this account was in: the approved campaign had 0 numbers attached because
    // every assignment targeted the superseded id.
    const campaignUsable = (updates.campaign_status ?? registration.campaign_status) === 'active';
    if (registration.brand_id && !campaignUsable) {
      const list = await listCampaignsForBrand(registration.brand_id);
      const usable = pickUsableCampaign(list.campaigns);
      if (usable && usable.campaignId !== registration.campaign_id) {
        console.log(
          `📇 Adopting live campaign ${usable.campaignId} for user ${user.id} ` +
          `(was ${registration.campaign_id ?? 'none'})`
        );
        updates.campaign_id = usable.campaignId;
        updates.campaign_status = 'active';
        updates.campaign_failure_reason = null;
      }
    }

    await supabaseAdmin.from('user_10dlc_registrations').update(updates).eq('id', registration.id);

    // The campaign just became usable, and this user may already own numbers
    // bought before it was approved. Attach them now rather than leaving the
    // user to find a button in Settings — an unattached number has its A2P
    // traffic filtered by carriers, which presents as "sending is broken" (#107).
    if (updates.campaign_status === 'active' && registration.campaign_status !== 'active') {
      const n = await assignAllUserNumbersToCampaign(user.id);
      const activeCampaign = updates.campaign_id ?? registration.campaign_id;
      if (n > 0) console.log(`📇 Campaign ${activeCampaign} approved — submitted ${n} number(s) for assignment`);
    }

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

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getBrandStatus, getCampaignStatus } from '@/lib/telnyx10dlc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

function mapBrandStatus(raw?: string): 'pending' | 'verified' | 'failed' {
  const s = (raw || '').toUpperCase();
  if (s.includes('VERIFIED')) return 'verified';
  if (s.includes('FAILED')) return 'failed';
  return 'pending';
}

function mapCampaignStatus(raw?: string): 'pending' | 'active' | 'failed' {
  const s = (raw || '').toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s.includes('FAILED')) return 'failed';
  return 'pending';
}

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

    if (registration.campaign_id && registration.campaign_status === 'pending') {
      const campaignResult = await getCampaignStatus(registration.campaign_id);
      if (campaignResult.success) {
        updates.campaign_status = mapCampaignStatus(campaignResult.status);
        updates.campaign_failure_reason = campaignResult.failureReasons?.join(' | ') || null;
      }
    }

    await supabaseAdmin.from('user_10dlc_registrations').update(updates).eq('id', registration.id);

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

// API Route: Update Lead Campaign Assignment
// Adds or removes leads from campaigns

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { leadIds, campaignId } = await req.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'leadIds required' }, { status: 400 });
    }

    // Update leads with the new campaign_id (or null to remove)
    const { data, error } = await supabase
      .from('leads')
      .update({
        campaign_id: campaignId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .in('id', leadIds)
      .select();

    if (error) {
      console.error('Error updating leads:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Update campaign lead counts
    if (campaignId) {
      // Get new lead count for target campaign
      const { count: newCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('campaign_id', campaignId);

      await supabase
        .from('campaigns')
        .update({
          lead_count: newCount || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('user_id', user.id);
    }

    console.log(`✅ Updated ${leadIds.length} leads to campaign: ${campaignId || 'none'}`);

    return NextResponse.json({
      ok: true,
      updated: data?.length || 0,
      campaignId,
    });

  } catch (error: any) {
    console.error('Error updating lead campaigns:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, campaigns: [], error: 'Not authenticated' }, { status: 401 });
    }

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      return NextResponse.json({ ok: false, campaigns: [], error: error.message }, { status: 500 });
    }

    // Get lead counts for all campaigns in a single query
    const campaignIds = (campaigns || []).map(c => c.id);
    let leadCountMap: Record<string, number> = {};

    if (campaignIds.length > 0) {
      const { data: leadCounts } = await supabase
        .from('leads')
        .select('campaign_id')
        .eq('user_id', user.id)
        .in('campaign_id', campaignIds);

      if (leadCounts) {
        for (const lead of leadCounts) {
          if (lead.campaign_id) {
            leadCountMap[lead.campaign_id] = (leadCountMap[lead.campaign_id] || 0) + 1;
          }
        }
      }
    }

    const campaignsWithCounts = (campaigns || []).map(campaign => ({
      ...campaign,
      lead_count: leadCountMap[campaign.id] || 0,
    }));

    return NextResponse.json({ ok: true, campaigns: campaignsWithCounts, items: campaignsWithCounts });
  } catch (error: any) {
    console.error('Error in GET /api/campaigns:', error);
    return NextResponse.json({ ok: false, campaigns: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, flowId, tags, lead_type } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Campaign name is required' }, { status: 400 });
    }

    // Start with minimal required fields
    const insertData: any = {
      user_id: user.id,
      name: name.trim(),
    };

    // Try to add flow_id if provided
    if (flowId) {
      insertData.flow_id = flowId;
    }

    // Add tags if provided
    if (tags && Array.isArray(tags)) {
      insertData.tags = tags;
    }

    // Add lead type/category if provided
    if (lead_type) {
      insertData.lead_type = lead_type;
    }

    // First try with flow_id
    let { data, error } = await supabase
      .from('campaigns')
      .insert(insertData)
      .select()
      .single();

    // If flow_id column doesn't exist, try without it but keep other fields
    if (error && error.message.includes('flow_id')) {
      console.log('flow_id column not found, retrying without it');
      const retryData2: any = {
        user_id: user.id,
        name: name.trim(),
      };
      if (tags && Array.isArray(tags)) retryData2.tags = tags;
      if (lead_type) retryData2.lead_type = lead_type;

      const { data: retryData, error: retryError } = await supabase
        .from('campaigns')
        .insert(retryData2)
        .select()
        .single();

      data = retryData;
      error = retryError;
    }

    if (error) {
      console.error('Error creating campaign:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, campaign: data });
  } catch (error: any) {
    console.error('Error in POST /api/campaigns:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, status, filters, fromNumbers, sendWindow, steps, stats, flow_id, tags, lead_type } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return NextResponse.json({ ok: false, error: 'Campaign name cannot be empty' }, { status: 400 });
      }
      updateData.name = trimmedName;
    }
    if (status !== undefined) updateData.status = status;
    if (filters !== undefined) updateData.filters = filters;
    if (fromNumbers !== undefined) updateData.from_numbers = fromNumbers;
    if (sendWindow !== undefined) updateData.send_window = sendWindow;
    if (steps !== undefined) updateData.steps = steps;
    if (stats !== undefined) updateData.stats = stats;
    if (flow_id !== undefined) updateData.flow_id = flow_id;
    if (tags !== undefined) updateData.tags = tags;
    if (lead_type !== undefined) updateData.lead_type = lead_type;

    let { data, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    // If lead_type column doesn't exist, retry without it
    if (error && error.message.includes('lead_type')) {
      console.log('lead_type column not found, retrying without it');
      delete updateData.lead_type;
      const { data: retryData, error: retryError } = await supabase
        .from('campaigns')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      data = retryData;
      error = retryError;
    }

    if (error) {
      console.error('Error updating campaign:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, campaign: data });
  } catch (error: any) {
    console.error('Error in PUT /api/campaigns:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting campaign:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/campaigns:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

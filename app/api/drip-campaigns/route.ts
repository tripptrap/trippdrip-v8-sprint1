import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Drip Campaigns Management API
 * CRUD operations for automated message sequence campaigns
 */

// GET - Fetch all campaigns or a specific campaign with steps
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('id');
    const includeSteps = searchParams.get('includeSteps') !== 'false';
    const activeOnly = searchParams.get('activeOnly') === 'true';

    if (campaignId) {
      // Fetch specific campaign with steps
      const { data: campaign, error: campaignError } = await supabase
        .from('drip_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('user_id', user.id)
        .single();

      if (campaignError || !campaign) {
        return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
      }

      // Get steps if requested
      let steps = null;
      if (includeSteps) {
        const { data: stepsData, error: stepsError } = await supabase
          .from('drip_campaign_steps')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('step_number', { ascending: true });

        if (stepsError) {
          console.error('Error fetching campaign steps:', stepsError);
        } else {
          steps = stepsData;
        }
      }

      // Get enrollment count
      const { count: enrollmentCount } = await supabase
        .from('drip_campaign_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);

      return NextResponse.json({
        ok: true,
        campaign: {
          ...campaign,
          steps: steps || [],
          enrollment_count: enrollmentCount || 0,
        },
      });
    }

    // Fetch all campaigns
    let query = supabase
      .from('drip_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      return NextResponse.json({ ok: false, error: campaignsError.message }, { status: 500 });
    }

    // Get enrollment counts for all campaigns
    const campaignIds = campaigns?.map(c => c.id) || [];
    const { data: enrollments } = await supabase
      .from('drip_campaign_enrollments')
      .select('campaign_id')
      .eq('user_id', user.id)
      .in('campaign_id', campaignIds);

    const enrollmentCounts = enrollments?.reduce((acc: any, e) => {
      acc[e.campaign_id] = (acc[e.campaign_id] || 0) + 1;
      return acc;
    }, {}) || {};

    // Get step counts
    const { data: steps } = await supabase
      .from('drip_campaign_steps')
      .select('campaign_id')
      .in('campaign_id', campaignIds);

    const stepCounts = steps?.reduce((acc: any, s) => {
      acc[s.campaign_id] = (acc[s.campaign_id] || 0) + 1;
      return acc;
    }, {}) || {};

    const campaignsWithCounts = campaigns?.map(campaign => ({
      ...campaign,
      enrollment_count: enrollmentCounts[campaign.id] || 0,
      step_count: stepCounts[campaign.id] || 0,
    }));

    return NextResponse.json({
      ok: true,
      campaigns: campaignsWithCounts || [],
      count: campaignsWithCounts?.length || 0,
    });

  } catch (error: any) {
    console.error('Error in GET /api/drip-campaigns:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch campaigns'
    }, { status: 500 });
  }
}

// POST - Create new campaign with steps
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, triggerType, triggerConfig, steps, isActive } = body;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Campaign name is required' }, { status: 400 });
    }

    if (!triggerType) {
      return NextResponse.json({ ok: false, error: 'Trigger type is required' }, { status: 400 });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ ok: false, error: 'At least one step is required' }, { status: 400 });
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .insert({
        user_id: user.id,
        name,
        description: description || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig || {},
        is_active: isActive !== undefined ? isActive : true,
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      return NextResponse.json({ ok: false, error: campaignError.message }, { status: 500 });
    }

    // Create steps
    const stepsToInsert = steps.map((step: any, index: number) => ({
      campaign_id: campaign.id,
      step_number: index + 1,
      delay_days: step.delayDays || 0,
      delay_hours: step.delayHours || 0,
      channel: step.channel || 'sms',
      subject: step.subject || null,
      content: step.content,
      template_id: step.templateId || null,
    }));

    const { data: createdSteps, error: stepsError } = await supabase
      .from('drip_campaign_steps')
      .insert(stepsToInsert)
      .select();

    if (stepsError) {
      console.error('Error creating campaign steps:', stepsError);
      // Rollback campaign creation
      await supabase.from('drip_campaigns').delete().eq('id', campaign.id);
      return NextResponse.json({ ok: false, error: stepsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      campaign: {
        ...campaign,
        steps: createdSteps,
      },
      message: 'Campaign created successfully',
    });

  } catch (error: any) {
    console.error('Error in POST /api/drip-campaigns:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to create campaign'
    }, { status: 500 });
  }
}

// PUT - Update campaign or toggle active status
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, description, triggerType, triggerConfig, isActive, steps } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    // Update campaign
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (triggerType !== undefined) updates.trigger_type = triggerType;
    if (triggerConfig !== undefined) updates.trigger_config = triggerConfig;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: campaign, error: updateError } = await supabase
      .from('drip_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating campaign:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    if (!campaign) {
      return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    }

    // Update steps if provided
    if (steps && Array.isArray(steps)) {
      // Delete existing steps
      await supabase
        .from('drip_campaign_steps')
        .delete()
        .eq('campaign_id', id);

      // Insert new steps
      const stepsToInsert = steps.map((step: any, index: number) => ({
        campaign_id: id,
        step_number: index + 1,
        delay_days: step.delayDays || 0,
        delay_hours: step.delayHours || 0,
        channel: step.channel || 'sms',
        subject: step.subject || null,
        content: step.content,
        template_id: step.templateId || null,
      }));

      await supabase
        .from('drip_campaign_steps')
        .insert(stepsToInsert);
    }

    return NextResponse.json({
      ok: true,
      campaign,
      message: 'Campaign updated successfully',
    });

  } catch (error: any) {
    console.error('Error in PUT /api/drip-campaigns:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to update campaign'
    }, { status: 500 });
  }
}

// DELETE - Delete campaign (and all associated steps and enrollments)
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

    // Delete campaign (cascades to steps and enrollments)
    const { error: deleteError } = await supabase
      .from('drip_campaigns')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting campaign:', deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Campaign deleted successfully',
    });

  } catch (error: any) {
    console.error('Error in DELETE /api/drip-campaigns:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to delete campaign'
    }, { status: 500 });
  }
}

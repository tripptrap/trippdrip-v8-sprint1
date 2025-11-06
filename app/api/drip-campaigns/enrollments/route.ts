import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Drip Campaign Enrollments API
 * Manage which leads are enrolled in which campaigns
 */

// GET - Fetch enrollments for a campaign or lead
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    const leadId = searchParams.get('leadId');
    const status = searchParams.get('status'); // active, paused, completed, cancelled

    let query = supabase
      .from('drip_campaign_enrollments')
      .select('*, leads(first_name, last_name, phone, email), drip_campaigns(name)')
      .eq('user_id', user.id);

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('enrolled_at', { ascending: false });

    const { data: enrollments, error: enrollmentsError } = await query;

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      return NextResponse.json({ ok: false, error: enrollmentsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      enrollments: enrollments || [],
      count: enrollments?.length || 0,
    });

  } catch (error: any) {
    console.error('Error in GET /api/drip-campaigns/enrollments:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch enrollments'
    }, { status: 500 });
  }
}

// POST - Enroll lead(s) in campaign
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId, leadIds, startImmediately } = body;

    if (!campaignId) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'At least one lead ID is required' }, { status: 400 });
    }

    // Get campaign and first step
    const { data: campaign, error: campaignError } = await supabase
      .from('drip_campaigns')
      .select('*, drip_campaign_steps(*)')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (!campaign.is_active) {
      return NextResponse.json({ ok: false, error: 'Campaign is not active' }, { status: 400 });
    }

    // Get first step
    const steps = campaign.drip_campaign_steps?.sort((a: any, b: any) => a.step_number - b.step_number);
    if (!steps || steps.length === 0) {
      return NextResponse.json({ ok: false, error: 'Campaign has no steps' }, { status: 400 });
    }

    const firstStep = steps[0];

    // Calculate next send time
    const now = new Date();
    let nextSendAt = null;

    if (startImmediately) {
      nextSendAt = now.toISOString();
    } else {
      const delayMs = (firstStep.delay_days * 24 * 60 * 60 * 1000) + (firstStep.delay_hours * 60 * 60 * 1000);
      nextSendAt = new Date(now.getTime() + delayMs).toISOString();
    }

    // Create enrollments (ignore duplicates)
    const enrollmentsToInsert = leadIds.map(leadId => ({
      campaign_id: campaignId,
      lead_id: leadId,
      user_id: user.id,
      status: 'active',
      current_step: 0,
      next_send_at: nextSendAt,
    }));

    const { data: enrollments, error: enrollError } = await supabase
      .from('drip_campaign_enrollments')
      .upsert(enrollmentsToInsert, {
        onConflict: 'campaign_id,lead_id',
        ignoreDuplicates: false,
      })
      .select();

    if (enrollError) {
      console.error('Error creating enrollments:', enrollError);
      return NextResponse.json({ ok: false, error: enrollError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      enrollments: enrollments || [],
      message: `${enrollments?.length || 0} lead(s) enrolled successfully`,
      count: enrollments?.length || 0,
    });

  } catch (error: any) {
    console.error('Error in POST /api/drip-campaigns/enrollments:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to enroll leads'
    }, { status: 500 });
  }
}

// PUT - Update enrollment status (pause, resume, cancel)
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { enrollmentId, status, nextSendAt } = body;

    if (!enrollmentId) {
      return NextResponse.json({ ok: false, error: 'Enrollment ID is required' }, { status: 400 });
    }

    const updates: any = {};
    if (status !== undefined) {
      if (!['active', 'paused', 'completed', 'cancelled'].includes(status)) {
        return NextResponse.json({
          ok: false,
          error: 'Invalid status. Must be: active, paused, completed, or cancelled'
        }, { status: 400 });
      }
      updates.status = status;

      if (status === 'completed' || status === 'cancelled') {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (nextSendAt !== undefined) {
      updates.next_send_at = nextSendAt;
    }

    const { data: enrollment, error: updateError } = await supabase
      .from('drip_campaign_enrollments')
      .update(updates)
      .eq('id', enrollmentId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating enrollment:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    if (!enrollment) {
      return NextResponse.json({ ok: false, error: 'Enrollment not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      enrollment,
      message: 'Enrollment updated successfully',
    });

  } catch (error: any) {
    console.error('Error in PUT /api/drip-campaigns/enrollments:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to update enrollment'
    }, { status: 500 });
  }
}

// DELETE - Remove enrollment (unenroll lead from campaign)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const enrollmentId = searchParams.get('id');

    if (!enrollmentId) {
      return NextResponse.json({ ok: false, error: 'Enrollment ID is required' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('drip_campaign_enrollments')
      .delete()
      .eq('id', enrollmentId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting enrollment:', deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Lead unenrolled successfully',
    });

  } catch (error: any) {
    console.error('Error in DELETE /api/drip-campaigns/enrollments:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to unenroll lead'
    }, { status: 500 });
  }
}

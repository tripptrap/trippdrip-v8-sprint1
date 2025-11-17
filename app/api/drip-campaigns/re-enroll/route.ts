import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Re-Enroll API - Re-drip existing contacts
 * Allows re-enrolling leads who have completed, cancelled, or been previously enrolled in a campaign
 */

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { campaignId, leadIds, resetProgress } = body;

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
    const delayMs = (firstStep.delay_days * 24 * 60 * 60 * 1000) + (firstStep.delay_hours * 60 * 60 * 1000);
    const nextSendAt = new Date(now.getTime() + delayMs).toISOString();

    let reEnrolledCount = 0;
    let skippedCount = 0;
    let resetCount = 0;

    for (const leadId of leadIds) {
      // Check for existing enrollment
      const { data: existingEnrollment } = await supabase
        .from('drip_campaign_enrollments')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('lead_id', leadId)
        .eq('user_id', user.id)
        .single();

      if (existingEnrollment) {
        // If exists and status is completed/cancelled, reset it
        if (['completed', 'cancelled'].includes(existingEnrollment.status) || resetProgress) {
          const { error: updateError } = await supabase
            .from('drip_campaign_enrollments')
            .update({
              status: 'active',
              current_step: 0,
              next_send_at: nextSendAt,
              completed_at: null,
              enrolled_at: now.toISOString(),
            })
            .eq('id', existingEnrollment.id);

          if (!updateError) {
            resetCount++;
            reEnrolledCount++;
          }
        } else if (existingEnrollment.status === 'active') {
          // Already active, skip
          skippedCount++;
        } else {
          // Paused - reactivate
          const { error: updateError } = await supabase
            .from('drip_campaign_enrollments')
            .update({
              status: 'active',
              next_send_at: nextSendAt,
            })
            .eq('id', existingEnrollment.id);

          if (!updateError) {
            reEnrolledCount++;
          }
        }
      } else {
        // No existing enrollment, create new
        const { error: insertError } = await supabase
          .from('drip_campaign_enrollments')
          .insert({
            campaign_id: campaignId,
            lead_id: leadId,
            user_id: user.id,
            status: 'active',
            current_step: 0,
            next_send_at: nextSendAt,
            enrolled_at: now.toISOString(),
          });

        if (!insertError) {
          reEnrolledCount++;
        }
      }
    }

    let message = `${reEnrolledCount} lead(s) re-enrolled successfully`;
    if (resetCount > 0) {
      message += `, ${resetCount} reset from completion`;
    }
    if (skippedCount > 0) {
      message += `, ${skippedCount} already active`;
    }

    return NextResponse.json({
      ok: true,
      message,
      reEnrolledCount,
      resetCount,
      skippedCount,
      totalProcessed: leadIds.length,
    });

  } catch (error: any) {
    console.error('Error in POST /api/drip-campaigns/re-enroll:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to re-enroll leads'
    }, { status: 500 });
  }
}

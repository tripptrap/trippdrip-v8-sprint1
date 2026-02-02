import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check for drip campaigns with matching triggers and auto-enroll the lead.
 *
 * Trigger types:
 * - lead_created: fires when a new lead is created
 * - tag_added: fires when a specific tag is added to a lead
 * - status_change: fires when a lead's status changes to a specific value
 * - no_reply: fires when a lead hasn't replied within X hours (handled by cron)
 */
export async function checkAndEnrollDripTriggers(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  triggerType: 'lead_created' | 'tag_added' | 'status_change',
  triggerData: {
    tag?: string;
    status?: string;
    source?: string;
  } = {}
) {
  try {
    // Fetch active drip campaigns for this user with matching trigger type
    const { data: campaigns, error } = await supabase
      .from('drip_campaigns')
      .select('id, trigger_type, trigger_config')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('trigger_type', triggerType);

    if (error || !campaigns || campaigns.length === 0) return;

    for (const campaign of campaigns) {
      const config = campaign.trigger_config || {};
      let shouldEnroll = false;

      switch (triggerType) {
        case 'lead_created':
          // Enroll all new leads, or filter by source if configured
          if (config.source) {
            shouldEnroll = triggerData.source === config.source;
          } else {
            shouldEnroll = true;
          }
          break;

        case 'tag_added':
          // Enroll when a specific tag is added
          if (config.tag && triggerData.tag) {
            shouldEnroll = triggerData.tag.toLowerCase() === config.tag.toLowerCase();
          } else if (!config.tag) {
            // No specific tag configured = any tag triggers it
            shouldEnroll = true;
          }
          break;

        case 'status_change':
          // Enroll when lead status changes to a specific value
          if (config.status && triggerData.status) {
            shouldEnroll = triggerData.status.toLowerCase() === config.status.toLowerCase();
          } else if (!config.status) {
            shouldEnroll = true;
          }
          break;
      }

      if (!shouldEnroll) continue;

      // Check if already enrolled (active or paused)
      const { data: existing } = await supabase
        .from('drip_campaign_enrollments')
        .select('id, status')
        .eq('campaign_id', campaign.id)
        .eq('lead_id', leadId)
        .in('status', ['active', 'paused'])
        .single();

      if (existing) continue; // Already enrolled

      // Get the first step to calculate next_send_at
      const { data: firstStep } = await supabase
        .from('drip_campaign_steps')
        .select('delay_days, delay_hours')
        .eq('campaign_id', campaign.id)
        .order('step_number', { ascending: true })
        .limit(1)
        .single();

      if (!firstStep) continue; // No steps configured

      const now = new Date();
      const delayMs = ((firstStep.delay_days || 0) * 24 * 60 * 60 * 1000) +
                      ((firstStep.delay_hours || 0) * 60 * 60 * 1000);
      const nextSendAt = new Date(now.getTime() + delayMs).toISOString();

      // Enroll the lead
      await supabase
        .from('drip_campaign_enrollments')
        .upsert({
          campaign_id: campaign.id,
          lead_id: leadId,
          user_id: userId,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt,
          enrolled_at: now.toISOString(),
        }, {
          onConflict: 'campaign_id,lead_id',
          ignoreDuplicates: true,
        });

      console.log(`📧 Drip: Auto-enrolled lead ${leadId} in campaign ${campaign.id} (trigger: ${triggerType})`);
    }
  } catch (err) {
    console.error('Error in drip trigger enrollment:', err);
  }
}

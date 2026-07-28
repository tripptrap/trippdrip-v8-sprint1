// Turn a drip enrollment into real scheduled_messages rows.
//
// Previously a drip stored only a pointer — current_step plus next_send_at —
// and process-drips computed the following send time after each message went
// out. So a five-step drip never had five pending rows, it had one moving
// cursor. That meant the scheduled-messages view couldn't show what a lead had
// queued, and no individual future step could be edited or cancelled.
//
// Materialising the whole sequence up front fixes that, and hands delivery to
// process-scheduled — which is where quiet hours, DNC, the claim-before-send
// guard (#44), credit deduction and thread attachment (#59) already live.
// Keeping two send paths in step with all of that was the alternative, and
// today already showed how that goes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateSMSCredits } from '@/lib/creditCalculator';

/** Substitute lead fields, matching what process-drips did at send time. */
function personalize(template: string, lead: any): string {
  return (template || '')
    .replace(/\{\{first\}\}/gi, lead?.first_name || '')
    .replace(/\{\{last\}\}/gi, lead?.last_name || '')
    .replace(/\{\{phone\}\}/gi, lead?.phone || '')
    .replace(/\{\{email\}\}/gi, lead?.email || '')
    .replace(/\{\{state\}\}/gi, lead?.state || '');
}

interface MaterializeArgs {
  enrollmentId: string;
  campaignId: string;
  leadId: string;
  userId: string;
  /** Sequence start. Defaults to now. */
  from?: Date;
}

/**
 * Write one scheduled_messages row per drip step.
 *
 * Step delays are cumulative — each step's delay is relative to the previous
 * message, not to enrollment, which is how process-drips computed them.
 *
 * Also clears next_send_at on the enrollment. get_drip_enrollments_ready_to_send()
 * requires `next_send_at IS NOT NULL`, so this removes the enrollment from the
 * drip cron and leaves exactly one system sending — no double-send, and no
 * change needed to that cron.
 */
export async function materializeDripSteps(
  supabase: SupabaseClient,
  { enrollmentId, campaignId, leadId, userId, from = new Date() }: MaterializeArgs
): Promise<{ created: number; error?: string }> {
  const { data: steps, error: stepsError } = await supabase
    .from('drip_campaign_steps')
    .select('id, step_number, delay_days, delay_hours, content, channel')
    .eq('campaign_id', campaignId)
    .order('step_number', { ascending: true });

  if (stepsError) return { created: 0, error: stepsError.message };
  if (!steps?.length) return { created: 0 };

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, email, state')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) return { created: 0, error: leadError?.message || 'Lead not found' };
  if (!lead.phone) return { created: 0, error: 'Lead has no phone number' };

  let cursor = from.getTime();
  const rows = steps.map((step) => {
    cursor += ((step.delay_days || 0) * 86400 + (step.delay_hours || 0) * 3600) * 1000;

    // Rendered now rather than at send. A later name change won't be picked up,
    // which is the trade for the message being visible and editable in advance.
    const body = personalize(step.content, lead);
    const calc = calculateSMSCredits(body, 0);

    return {
      user_id: userId,
      lead_id: leadId,
      channel: step.channel || 'sms',
      body,
      status: 'pending',
      scheduled_for: new Date(cursor).toISOString(),
      credits_cost: calc.credits,
      segments: calc.segments,
      source: 'drip',
      drip_enrollment_id: enrollmentId,
      drip_step_id: step.id,
    };
  });

  const { error: insertError } = await supabase.from('scheduled_messages').insert(rows);
  if (insertError) return { created: 0, error: insertError.message };

  const { error: clearError } = await supabase
    .from('drip_campaign_enrollments')
    .update({ next_send_at: null })
    .eq('id', enrollmentId);

  if (clearError) {
    // Both systems would now send. Roll the rows back rather than risk it.
    console.error(`Materialised drip ${enrollmentId} but could not clear next_send_at — rolling back:`, clearError);
    await supabase.from('scheduled_messages').delete().eq('drip_enrollment_id', enrollmentId);
    return { created: 0, error: `Could not hand off from the drip cron: ${clearError.message}` };
  }

  return { created: rows.length };
}

/**
 * Cancel a lead's not-yet-sent drip messages — on reply, opt-out, or unenroll.
 *
 * Only touches `pending` rows, so anything already sent or in flight is left
 * alone. Scoped to drip-sourced rows, so manually scheduled messages survive:
 * a lead replying shouldn't silently bin a message the user wrote by hand.
 */
export async function cancelPendingDripMessages(
  supabase: SupabaseClient,
  opts: { enrollmentId?: string; leadId?: string; reason?: string }
): Promise<number> {
  const { enrollmentId, leadId, reason = 'Drip stopped' } = opts;
  if (!enrollmentId && !leadId) return 0;

  let q = supabase
    .from('scheduled_messages')
    .update({ status: 'cancelled', error_message: reason, updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .not('drip_enrollment_id', 'is', null);

  if (enrollmentId) q = q.eq('drip_enrollment_id', enrollmentId);
  if (leadId) q = q.eq('lead_id', leadId);

  const { data, error } = await q.select('id');
  if (error) {
    console.error('Failed to cancel pending drip messages:', error);
    return 0;
  }
  return data?.length ?? 0;
}

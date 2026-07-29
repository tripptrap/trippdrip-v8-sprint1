// What happens when an AI flow finishes collecting everything (#70).
//
// Before this, completion was detected (`allAnswered` in the SMS webhook) and
// passed to the AI so it would steer toward booking — and then nothing acted on
// it. No appointment, no tag, no completion record. CLAUDE.md promises "gathers
// required info → books appointment → auto-tags 'appointment set'"; only the
// first third existed.
//
// The chosen shape is confirm-then-book: once every field is collected the lead
// is asked to confirm, and the appointment is only created when they agree. So
// this module has two halves — mark as awaiting confirmation, then book on an
// affirmative reply.

import type { SupabaseClient } from '@supabase/supabase-js';

export const APPOINTMENT_TAG = 'appointment set';

/**
 * Does this reply agree to the proposed appointment?
 *
 * Deliberately narrow. A false positive books an appointment the lead never
 * agreed to, which is worse than asking again — so ambiguous replies ("maybe",
 * "what times do you have") fall through to the AI, which can re-offer.
 *
 * Whole-message matches only: "yes" confirms, "yes but can we do Tuesday"
 * doesn't, because that's a reschedule request the AI should handle.
 *
 * Note "yes" is also an opt-in keyword, but the webhook only treats it as a
 * re-subscribe when the number is actually on the DNC list, so it reaches here
 * in the normal case.
 */
const AFFIRMATIVE = new Set([
  'yes', 'yes please', 'y', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'k',
  'confirm', 'confirmed', 'sounds good', 'that works', 'works for me',
  'perfect', 'great', 'book it', 'lets do it', "let's do it", 'im in', "i'm in",
]);

export function isAffirmative(message: string): boolean {
  const cleaned = (message || '')
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, '')
    .replace(/\s+/g, ' ');
  return AFFIRMATIVE.has(cleaned);
}

interface AwaitArgs {
  supabase: SupabaseClient;
  leadId: string;
  /** Existing conversation_state, so it isn't clobbered. */
  conversationState: Record<string, any> | null;
  /** ISO time the AI offered, when it proposed a specific slot. */
  proposedAt?: string | null;
}

/**
 * Record that the flow is complete and we're waiting on the lead to confirm.
 * Idempotent — safe to call on every turn once `allAnswered` is true.
 */
export async function markAwaitingConfirmation({
  supabase, leadId, conversationState, proposedAt = null,
}: AwaitArgs): Promise<void> {
  const state = conversationState || {};
  if (state.awaitingAppointmentConfirmation && !proposedAt) return;

  const { error } = await supabase
    .from('leads')
    .update({
      conversation_state: {
        ...state,
        awaitingAppointmentConfirmation: true,
        proposedAppointmentAt: proposedAt ?? state.proposedAppointmentAt ?? null,
        awaitingSince: state.awaitingSince ?? new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) console.error(`Flow completion: could not mark lead ${leadId} awaiting confirmation:`, error);
}

export function isAwaitingConfirmation(conversationState: Record<string, any> | null): boolean {
  return !!conversationState?.awaitingAppointmentConfirmation;
}

interface BookArgs {
  supabase: SupabaseClient;
  userId: string;
  lead: { id: string; first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null; tags?: string[] | null; conversation_state?: Record<string, any> | null };
  flowId?: string | null;
  campaignId?: string | null;
  /** Steps collected / total, for the completion record. */
  stepsCompleted?: number;
  totalSteps?: number;
}

export interface BookResult {
  booked: boolean;
  appointmentAt?: string;
  eventId?: string;
  error?: string;
}

/**
 * The lead agreed — create the appointment and close out the flow.
 *
 * Each step is independent and failures are logged rather than thrown: by the
 * time this runs the lead has verbally committed, so a tagging or logging
 * problem must not lose the appointment itself.
 */
export async function confirmAndBookAppointment({
  supabase, userId, lead, flowId = null, campaignId = null,
  stepsCompleted = 0, totalSteps = 0,
}: BookArgs): Promise<BookResult> {
  const state = lead.conversation_state || {};

  // Use the time the AI proposed; otherwise default to the next business-hours
  // slot 24h out, so a booking never lands at 3am when no slot was discussed.
  const appointmentAt = state.proposedAppointmentAt
    ? new Date(state.proposedAppointmentAt)
    : defaultSlot();

  if (isNaN(appointmentAt.getTime())) {
    return { booked: false, error: 'Proposed appointment time was not a valid date' };
  }

  const end = new Date(appointmentAt.getTime() + 30 * 60 * 1000);
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';

  // google_event_id is nullable as of the #70 migration — NULL means booked in
  // HyveWyre but not synced to Google, which is normal when Google isn't
  // connected. Syncing is a separate concern and shouldn't block booking.
  const { data: event, error: eventError } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      lead_id: lead.id,
      lead_phone: lead.phone ?? null,
      summary: `Appointment with ${name}`,
      description: 'Booked automatically after the lead confirmed in an AI flow conversation.',
      start_time: appointmentAt.toISOString(),
      end_time: end.toISOString(),
      attendee_name: name,
      attendee_email: lead.email ?? null,
      reminder_status: 'pending',
    })
    .select('id')
    .single();

  if (eventError) {
    console.error(`❌ Flow completion: failed to create appointment for lead ${lead.id}:`, eventError);
    return { booked: false, error: eventError.message };
  }

  // Tag and mark the lead. `primary_tag` drives the pipeline view.
  const tags = Array.from(new Set([...(lead.tags || []), APPOINTMENT_TAG]));
  const { error: leadError } = await supabase
    .from('leads')
    .update({
      appointment_scheduled: true,
      appointment_at: appointmentAt.toISOString(),
      tags,
      primary_tag: APPOINTMENT_TAG,
      conversation_state: {
        ...state,
        awaitingAppointmentConfirmation: false,
        appointmentBookedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  if (leadError) console.error(`Flow completion: appointment created but lead ${lead.id} not updated:`, leadError);

  // campaign_id is NOT NULL on this table, so only log when we have one —
  // otherwise the insert fails and takes the log entry with it.
  if (campaignId) {
    const { error: logError } = await supabase.from('flow_completion_log').insert({
      user_id: userId,
      lead_id: lead.id,
      flow_id: flowId,
      campaign_id: campaignId,
      steps_completed: stepsCompleted,
      total_steps: totalSteps,
      completion_type: 'appointment_booked',
      completed_at: new Date().toISOString(),
    });
    if (logError) console.error(`Flow completion: could not log completion for lead ${lead.id}:`, logError);
  }

  console.log(`📅 Flow complete — appointment booked for lead ${lead.id} at ${appointmentAt.toISOString()}`);
  return { booked: true, appointmentAt: appointmentAt.toISOString(), eventId: event?.id };
}

/** Next weekday at 10:00 local-ish, 24h+ out. Only used when no slot was proposed. */
function defaultSlot(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

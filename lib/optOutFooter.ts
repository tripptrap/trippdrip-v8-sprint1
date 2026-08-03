// The opt-out footer on a first message (#131).
//
// The public compliance evidence at hyvewyre.com/opt-in-proof.html — the URL
// submitted to Telnyx as the opt-in workflow evidence — states:
//
//   "The first message sent to any new recipient automatically includes opt-out
//    instructions appended to the message body"
//
// That was appended in three routes and not in a shared place, so it was true of
// manual sends, campaigns, drips, AI drips and receptionist replies (the last
// three reach it through `telnyx/send-sms`) and **false of scheduled sends and
// bulk scheduling** — both of which carry agent-authored marketing and can
// easily be a first contact.
//
// Rather than weaken a claim that ought to be true, the behaviour is completed
// here. Appointment reminders and calendar links are deliberately not included:
// both go to someone who already has a booked appointment, so they are never a
// first contact, and the first-message test below would decline them anyway.
//
// CLAUDE.md states the rule as product intent: "First message to a lead
// auto-appends opt-out footer; subsequent messages do not."

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Has this account messaged this number before?
 *
 * Mirrors the existing test in `telnyx/send-sms` — the presence of a thread —
 * so the two agree on what "first" means. On a lookup failure it answers "yes,
 * first", which appends the footer: an extra opt-out line on a later message is
 * harmless, a missing one on a first message is a compliance failure.
 */
export async function isFirstContact(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  channel = 'sms'
): Promise<boolean> {
  const { data, error } = await supabase
    .from('threads')
    .select('id')
    .eq('user_id', userId)
    .eq('phone_number', phone)
    .eq('channel', channel)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`isFirstContact lookup failed for ${phone} — assuming first:`, error);
    return true;
  }
  return !data;
}

/**
 * The account's configured opt-out keyword, defaulting to STOP.
 *
 * Read separately from the send so a caller can fetch it once for a batch
 * rather than per message.
 */
export async function optOutKeywordFor(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('user_settings')
    .select('opt_out_keyword')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.opt_out_keyword || 'STOP';
}

/** Identical wording to the three routes that already do this. */
export function appendOptOut(body: string, keyword: string): string {
  return `${body}\n\nReply ${keyword} to opt out`;
}

/**
 * Append the footer if, and only if, this is a first contact.
 *
 * One call for the paths that had none. Returns the body unchanged when the
 * account has messaged this number before.
 */
export async function withOptOutFooterIfFirst(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  body: string
): Promise<string> {
  if (!(await isFirstContact(supabase, userId, phone))) return body;
  return appendOptOut(body, await optOutKeywordFor(supabase, userId));
}

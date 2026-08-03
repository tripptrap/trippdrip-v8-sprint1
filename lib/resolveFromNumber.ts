/**
 * Which of the agent's numbers should this message go out from? (#122)
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `selectClosestNumber` was wired into 2 of 8 send paths — `telnyx/send-sms`
 * and `campaigns/run`. The other six each hand-rolled their own
 * `.eq('is_primary', true)` lookup, so **drips, scheduled sends, AI follow-ups,
 * bulk sends and appointment reminders all went from a single number** no
 * matter how many an agent owned. That is most of the automated volume, and
 * extra numbers are exactly what the Scale tier sells (#11).
 *
 * Same failure as the rate limits in #121: implemented where someone was
 * looking, missed everywhere else. Same fix: one resolver every path calls, so
 * a seventh or ninth path inherits the behaviour instead of reimplementing it.
 *
 * ── The rules, in order ─────────────────────────────────────────────────────
 *
 * 1. Rested numbers are never selected. Resting ("ghosting") a number takes it
 *    out of rotation so its carrier reputation can recover.
 * 2. A locked number wins outright. Locking says "keep using this one" — an
 *    agent who has told contacts to text a specific number needs it to stay
 *    put, regardless of where the lead is.
 * 3. Otherwise the user's mode decides: `geo` picks the closest number to the
 *    lead, `primary` always uses the primary.
 * 4. Failing all that, the primary; failing that, any active number.
 *
 * Never returns a rested number, and never returns null when the agent has at
 * least one usable number — a send that cannot resolve a from-number fails, and
 * failing to send is worse than sending from a less-ideal number.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectClosestNumber } from './geo/selectClosestNumber';

export type NumberSelectionMode = 'geo' | 'primary';

export interface ResolveOptions {
  /** Lead's ZIP, used in `geo` mode. Absent is fine — falls back to primary. */
  leadZipCode?: string | null;
  /** Skips the settings lookup when the caller already has the mode. */
  mode?: NumberSelectionMode;
}

interface NumberRow {
  phone_number: string;
  is_primary: boolean | null;
  locked_until: string | null;
  rested_until: string | null;
}

const inFuture = (ts: string | null | undefined): boolean =>
  !!ts && Date.parse(ts) > Date.now();

/**
 * @param supabase service-role client — several callers are crons acting for
 *                 another user, and `user_telnyx_numbers` is under RLS.
 * @returns an E.164 number, or null when the agent has no usable number.
 */
export async function resolveFromNumber(
  supabase: SupabaseClient,
  userId: string,
  options: ResolveOptions = {}
): Promise<string | null> {
  const { data: numbers, error } = await supabase
    .from('user_telnyx_numbers')
    .select('phone_number, is_primary, locked_until, rested_until')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error(`resolveFromNumber: could not read numbers for ${userId}:`, error);
    return null;
  }
  if (!numbers?.length) return null;

  const rows = numbers as NumberRow[];

  // 1. Rested numbers are out of rotation entirely.
  const usable = rows.filter(n => !inFuture(n.rested_until));
  if (!usable.length) {
    // Everything is resting. Sending from a rested number defeats the point of
    // resting it, but not sending at all is worse — and the agent chose to rest
    // them, so this is worth surfacing rather than silently doing either.
    console.warn(
      `resolveFromNumber: every number for ${userId} is rested — falling back to the primary so the send is not lost`
    );
    return (rows.find(n => n.is_primary) ?? rows[0]).phone_number;
  }

  // 2. A lock beats everything, including geo.
  const locked = usable.find(n => inFuture(n.locked_until));
  if (locked) return locked.phone_number;

  // One number and nothing to decide.
  if (usable.length === 1) return usable[0].phone_number;

  // 3. Mode.
  let mode = options.mode;
  if (!mode) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('number_selection_mode')
      .eq('user_id', userId)
      .maybeSingle();
    mode = (settings?.number_selection_mode as NumberSelectionMode) || 'geo';
  }

  if (mode === 'geo' && options.leadZipCode) {
    const closest = await selectClosestNumber(userId, options.leadZipCode, supabase);
    // Only accept it if it is not resting — selectClosestNumber knows nothing
    // about rest state, so filtering here is what keeps that guarantee true.
    if (closest && usable.some(n => n.phone_number === closest)) return closest;
  }

  // 4. Primary, else anything usable.
  return (usable.find(n => n.is_primary) ?? usable[0]).phone_number;
}

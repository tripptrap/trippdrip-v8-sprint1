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
import { getNumberCapacity } from './numberCapacity';

export type NumberSelectionMode = 'geo' | 'primary';

/**
 * Why this is a discriminated result and not `string | null` (#125).
 *
 * A bare null collapsed two conditions that need opposite handling:
 *
 *   none_owned      permanent. The agent has no active number. Telling them to
 *                   claim one is correct, and a scheduled row should be failed
 *                   rather than retried for ever.
 *   lookup_failed   transient. The numbers table could not be read. Telling
 *                   someone to buy a number they already own is wrong, and
 *                   failing their scheduled message for a database blip is
 *                   worse — the next cron run would have succeeded.
 *
 * Every caller previously branched on falsiness alone and rendered some variant
 * of "claim a phone number first", so a transient error was reported as a
 * missing purchase, and on the cron paths it could mark work permanently failed.
 *
 * `retryable` mirrors the same field on SmsGuardResult, so the crons can apply
 * one rule to both: retryable means leave the row alone for the next run.
 */
export type FromNumberResult =
  | { ok: true; number: string }
  | {
      ok: false;
      /**
       * `all_exhausted` is temporary — every number the account holds has passed
       * a hard per-number ceiling and the window has to roll before any of them
       * can be used again (#123 gap 2). Retryable, so the crons defer rather
       * than failing the work.
       */
      reason: 'none_owned' | 'lookup_failed' | 'all_exhausted';
      detail: string;
      retryable: boolean;
    };

export interface ResolveOptions {
  /** Lead's ZIP, used in `geo` mode. Absent is fine — falls back to primary. */
  leadZipCode?: string | null;
  /** Skips the settings lookup when the caller already has the mode. */
  mode?: NumberSelectionMode;
  /**
   * Who is being messaged (#129).
   *
   * If a conversation with this person already exists, the send stays on the
   * number it started on. When a business moves from its starter toll-free to
   * its own local number, NEW conversations use the local one — but a lead first
   * contacted from the toll-free keeps hearing from the toll-free. Switching
   * mid-conversation breaks threading on the handset and reads as a stranger.
   *
   * Keyed on the recipient rather than a thread id because most callers resolve
   * a from-number BEFORE they look up or create the thread, so a thread id is
   * not available at the point of the decision — the recipient always is.
   */
  toPhone?: string | null;
}

interface NumberRow {
  phone_number: string;
  is_primary: boolean | null;
  locked_until: string | null;
  rested_until: string | null;
  /** Derived by trigger from the number itself — never set in code (#129). */
  number_type: string | null;
}

const inFuture = (ts: string | null | undefined): boolean =>
  !!ts && Date.parse(ts) > Date.now();

/**
 * Does this account actually hold this number? (#127)
 *
 * `user_telnyx_numbers.phone_number` is globally unique, so a number belongs to
 * exactly one tenant at a time. A route that accepts a caller-supplied number
 * without this check will happily send from **another tenant's** number,
 * attributing the traffic — and any complaint or opt-out it earns — to them.
 *
 * `telnyx/send-sms` had this check inline and correct; `campaigns/run` and
 * `ai-drip/start` accepted the number raw. Shared here so the next route that
 * takes a number from a request body has one obvious thing to call, rather than
 * a check to remember to reimplement.
 *
 * Deliberately ownership only. An agent who explicitly picks one of their own
 * numbers has made a deliberate choice, so this does not also refuse rested or
 * locked numbers — that would override the person on whose behalf rest exists.
 */
export async function ownsNumber(
  supabase: SupabaseClient,
  userId: string,
  phoneNumber: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_telnyx_numbers')
    .select('id')
    .eq('user_id', userId)
    .eq('phone_number', phoneNumber)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    // Fails CLOSED. "Cannot tell whether they own this number" must not permit
    // sending from it — unlike resolveFromNumber, where a lookup failure means
    // falling back to a number we would have chosen anyway.
    console.error(`ownsNumber: lookup failed for ${userId} / ${phoneNumber}:`, error);
    return false;
  }
  return !!data;
}

/**
 * @param supabase service-role client — several callers are crons acting for
 *                 another user, and `user_telnyx_numbers` is under RLS.
 * @returns the chosen number, or why one could not be chosen. See
 *          {@link FromNumberResult} — the two failure reasons need opposite
 *          handling and must not be collapsed back into a falsy check.
 */
export async function resolveFromNumber(
  supabase: SupabaseClient,
  userId: string,
  options: ResolveOptions = {}
): Promise<FromNumberResult> {
  const { data: numbers, error } = await supabase
    .from('user_telnyx_numbers')
    .select('phone_number, is_primary, locked_until, rested_until, number_type')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error(`resolveFromNumber: could not read numbers for ${userId}:`, error);
    return {
      ok: false,
      reason: 'lookup_failed',
      detail: 'Could not look up your phone numbers. This is usually temporary.',
      retryable: true,
    };
  }
  if (!numbers?.length) {
    return {
      ok: false,
      reason: 'none_owned',
      detail: 'No active phone number on this account. Claim a number before sending.',
      retryable: false,
    };
  }

  const rows = numbers as NumberRow[];

  // 0. A conversation stays on the number it started on (#129).
  //
  // Checked before everything else, including rest and capacity: those exist to
  // protect a number's reputation when CHOOSING one, and this is not a choice —
  // the number is already established with this person. Moving a live
  // conversation to a different number to protect the first one just damages
  // the second and confuses the recipient.
  //
  // Still requires the number to be one the account currently holds, so a
  // released or reassigned number is not used.
  if (options.toPhone) {
    const { data: threads } = await supabase
      .from('threads')
      .select('sending_number')
      .eq('user_id', userId)
      .eq('phone_number', options.toPhone)
      .not('sending_number', 'is', null)
      .limit(1);

    const pinned = threads?.[0]?.sending_number;
    // Still has to be a number the account currently holds, so a released or
    // reassigned one is never used.
    if (pinned && rows.some(n => n.phone_number === pinned)) {
      return { ok: true, number: pinned };
    }
  }

  // 1. Rested numbers are out of rotation entirely.
  const usable = rows.filter(n => !inFuture(n.rested_until));
  if (!usable.length) {
    // Everything is resting. Sending from a rested number defeats the point of
    // resting it, but not sending at all is worse — and the agent chose to rest
    // them, so this is worth surfacing rather than silently doing either.
    console.warn(
      `resolveFromNumber: every number for ${userId} is rested — falling back to the primary so the send is not lost`
    );
    return { ok: true, number: (rows.find(n => n.is_primary) ?? rows[0]).phone_number };
  }

  // 2. Per-number capacity (#123 gap 2).
  //
  // Two thresholds doing different jobs — see lib/numberCapacity for why a
  // single hard cap would have given single-number accounts nothing:
  //
  //   exhausted     past a hard ceiling. Removed from the pool entirely. The
  //                 ceilings sit ABOVE the per-account caps, so for a number
  //                 used by one tenant the account cap always binds first and
  //                 this cannot fire. It exists for a recycled pool number,
  //                 whose traffic spans tenants and which no per-account cap
  //                 can see.
  //   heavilyUsed   past a soft threshold. Avoided while anything else is
  //                 available. This is where a Scale account's extra numbers
  //                 earn their keep: load spreads before anything is blocked.
  //
  // Counted across ALL tenants, deliberately. A pool number carries its history
  // to whoever holds it next.
  const capacity = await getNumberCapacity(supabase, usable.map(n => n.phone_number));

  const withCapacity = usable.filter(n => !capacity.get(n.phone_number)?.exhausted);

  if (!withCapacity.length) {
    // Unlike rest — which the agent chose, and which therefore falls back
    // rather than losing a send — a ceiling is a safety limit. Falling back
    // here would defeat the only thing it does.
    const worst = capacity.get(usable[0].phone_number);
    console.warn(`resolveFromNumber: every number for ${userId} is at its send ceiling`);
    return {
      ok: false,
      reason: 'all_exhausted',
      detail:
        `Every one of your numbers has hit its sending ceiling` +
        (worst?.reason ? ` (${worst.reason})` : '') +
        `. Sending resumes automatically as the window clears.`,
      retryable: true,
    };
  }

  // 3. A lock beats everything, including geo — but not the ceiling above, which
  //    is why this runs after it. "Keep using this one" is a routing preference;
  //    the ceiling is there to stop a number being damaged.
  const locked = withCapacity.find(n => inFuture(n.locked_until));
  if (locked) return { ok: true, number: locked.phone_number };

  // One number and nothing to decide.
  if (withCapacity.length === 1) return { ok: true, number: withCapacity[0].phone_number };

  // Prefer numbers under the soft threshold, but only while some exist — if
  // every number is heavily used they are all equally valid again and the
  // normal rules below decide.
  const light = withCapacity.filter(n => !capacity.get(n.phone_number)?.heavilyUsed);
  const pool = light.length ? light : withCapacity;
  if (pool.length === 1) return { ok: true, number: pool[0].phone_number };

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
    // Checked against `pool`, not `usable`. selectClosestNumber knows nothing
    // about rest or capacity, so filtering here is the only thing keeping both
    // guarantees true — matching against `usable` would hand back a number this
    // function had just excluded for being at its ceiling.
    if (closest && pool.some(n => n.phone_number === closest)) {
      return { ok: true, number: closest };
    }
  }

  // 4. Prefer the account's own local numbers over a shared starter toll-free
  //    (#129). A toll-free from the pool is a starter number, used so a business
  //    can work immediately while its own registration completes. Once it has a
  //    local number, new conversations belong there — the toll-free is shared
  //    infrastructure and its reputation is everyone's.
  //
  //    Only for NEW conversations: a reply already returned above.
  const localOnly = pool.filter(n => n.number_type !== 'tollfree');
  const preferred = localOnly.length ? localOnly : pool;

  // 5. Primary, else anything left.
  return { ok: true, number: (preferred.find(n => n.is_primary) ?? preferred[0]).phone_number };
}

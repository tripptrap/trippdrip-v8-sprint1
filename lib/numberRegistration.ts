// Is a number actually allowed to carry business traffic?
//
// Two different systems answer that, depending on the number:
//
//   long code (local)  must be assigned to a 10DLC campaign
//   toll-free          must pass a Toll-Free Verification request
//
// They are registered separately, fail separately, and are fixed separately, so
// this module keeps both facts and decides per number type rather than storing
// one flattened boolean.
//
// ── Why this exists (audit, 2026-08-03) ─────────────────────────────────────
//
// `user_telnyx_numbers` recorded type, primary, lock and rest — every property
// except the one carriers gate on. resolveFromNumber therefore could not prefer
// a registered number, and on the live account it reliably chose the wrong one:
// the primary local number, which is assigned to no campaign, while a
// campaign-assigned local and a TFV-verified toll-free sat unused.
//
// Unregistered A2P long-code traffic is filtered by carriers and burns the
// number's reputation. It is not a slightly worse choice — it is the one choice
// that cannot work.

import type { SupabaseClient } from '@supabase/supabase-js';

/** The columns isRegistered needs. Kept minimal so callers can select narrowly. */
export interface RegistrationFields {
  number_type: string | null;
  messaging_campaign_id: string | null;
  tollfree_verification_status: string | null;
  /** Per-carrier mapping. Absent on callers that predate these columns. */
  att_mapping_status?: string | null;
  tmobile_mapping_status?: string | null;
  other_carrier_mapping_status?: string | null;
}

/**
 * Carriers this number is assigned to the campaign for, but NOT mapped at.
 *
 * A number can be `assignmentStatus: ASSIGNED` while an individual carrier's
 * mapping is FAILED — which is the live state of both long codes on this
 * account, AT&T failed on each. That is not a small detail: AT&T is roughly a
 * third of US mobile, and the failure is silent. Messages are accepted, then
 * filtered, and it reads as "they never replied".
 *
 * Deliberately does NOT make isRegistered() false. A number mapped at T-Mobile
 * and everyone else still delivers to most people, and refusing to send from it
 * would be a bigger outage than the gap it is warning about. This is for
 * surfacing, and for choosing between two otherwise-equal numbers.
 */
export function unmappedCarriers(n: RegistrationFields): string[] {
  if (n.number_type === 'tollfree') return [];
  const failed: string[] = [];
  if (n.att_mapping_status && n.att_mapping_status !== 'ADDED') failed.push('AT&T');
  if (n.tmobile_mapping_status && n.tmobile_mapping_status !== 'ADDED') failed.push('T-Mobile');
  if (n.other_carrier_mapping_status && n.other_carrier_mapping_status !== 'ADDED') {
    failed.push('Verizon and others');
  }
  return failed;
}

/**
 * Can this number legitimately send?
 *
 * Fails CLOSED on anything unknown. All-null (never synced) reads as NOT
 * registered, which is the safe direction: the cost of a false negative is
 * using a different number, the cost of a false positive is filtered traffic
 * and a damaged number.
 */
export function isRegistered(n: RegistrationFields): boolean {
  if (n.number_type === 'tollfree') {
    return n.tollfree_verification_status === 'verified';
  }
  // Local and anything else: a long code needs a campaign assignment.
  return !!n.messaging_campaign_id;
}

/** Why a number cannot send, for the UI. Null when it can. */
export function registrationGap(n: RegistrationFields): string | null {
  if (isRegistered(n)) return null;
  if (n.number_type === 'tollfree') {
    if (n.tollfree_verification_status === 'rejected') return 'Toll-free verification was rejected';
    if (n.tollfree_verification_status === 'pending') return 'Toll-free verification is still pending';
    return 'Toll-free verification has not been submitted';
  }
  return 'Not assigned to a 10DLC campaign';
}

const TELNYX = 'https://api.telnyx.com';

async function telnyx(path: string): Promise<any | null> {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) {
    console.error('syncNumberRegistration: TELNYX_API_KEY is not set');
    return null;
  }
  try {
    const res = await fetch(`${TELNYX}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    // A 404 from the campaign endpoint is a real answer — "this number is
    // assigned to nothing" — not a failure. Distinguished by the caller.
    if (res.status === 404) return { notFound: true };
    if (!res.ok) {
      console.error(`syncNumberRegistration: ${path} returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`syncNumberRegistration: ${path} threw:`, e);
    return null;
  }
}

/**
 * Reconcile one account's numbers against Telnyx and cache the result.
 *
 * Telnyx is the source of truth — assignment can change outside this app, so
 * these columns are a cache, and `registration_synced_at` records how stale the
 * answer is.
 *
 * Deliberately does not throw. Registration state that cannot be refreshed
 * should leave the previous answer in place, not blank it: wiping it would
 * silently downgrade a registered number to unregistered and stop the account
 * sending.
 *
 * @returns how many numbers were updated, or null if nothing could be read.
 */
export async function syncNumberRegistration(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data: numbers, error } = await supabase
    .from('user_telnyx_numbers')
    .select('id, phone_number, number_type')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('syncNumberRegistration: could not read numbers:', error);
    return null;
  }
  if (!numbers?.length) return 0;

  // One TFV listing covers the whole account, and a single request can name
  // several numbers, so fetch it once and index by number rather than asking
  // per toll-free number.
  const tfvByNumber = new Map<string, string>();
  if (numbers.some(n => n.number_type === 'tollfree')) {
    const tfv = await telnyx('/v2/messaging_tollfree/verification/requests?page=1&page_size=100');
    const records: any[] = tfv?.records || tfv?.data || [];
    // Sort by timestamp rather than trusting the list order.
    //
    // This was `[...records].reverse()` on the assumption that Telnyx returns
    // newest first. It returns OLDEST first, so reversing made the oldest
    // verdict win — and on the live account that turned a currently **Verified**
    // toll-free into "rejected", which would have blocked it from sending. The
    // three records for these numbers are Rejected (Dec 20), Rejected (Dec 26),
    // Verified (Jan 10); only the last is current.
    //
    // Sorting ascending and letting later writes overwrite is correct under
    // either ordering, so this no longer depends on undocumented API behaviour.
    const ts = (r: any) => Date.parse(r?.updatedAt || r?.createdAt || 0) || 0;
    for (const rec of [...records].sort((a, b) => ts(a) - ts(b))) {
      const status = String(rec?.verificationStatus || '').toLowerCase();
      for (const p of rec?.phoneNumbers || []) {
        const num = typeof p === 'string' ? p : p?.phoneNumber;
        if (num) tfvByNumber.set(num, status);
      }
    }
  }

  const syncedAt = new Date().toISOString();
  let updated = 0;

  for (const n of numbers) {
    let campaignId: string | null = null;
    let tfvStatus: string | null = null;
    let att: string | null = null;
    let tmo: string | null = null;
    let other: string | null = null;

    if (n.number_type === 'tollfree') {
      tfvStatus = tfvByNumber.get(n.phone_number) ?? null;
    } else {
      const res = await telnyx(`/10dlc/phone_number_campaigns/${encodeURIComponent(n.phone_number)}`);
      if (res === null) continue; // transient — keep whatever is already stored
      campaignId = res.notFound ? null : (res.campaignId ?? null);
      // Per-carrier mapping. ASSIGNED with a FAILED carrier is a real state and
      // was invisible until it was stored — see unmappedCarriers().
      if (!res.notFound) {
        att = res.attNumberMappingStatus ?? null;
        tmo = res.tmobileNumberMappingStatus ?? null;
        other = res.nonTmobileNumberMappingStatus ?? null;
      }
    }

    const { error: upErr } = await supabase
      .from('user_telnyx_numbers')
      .update({
        messaging_campaign_id: campaignId,
        tollfree_verification_status: tfvStatus,
        att_mapping_status: att,
        tmobile_mapping_status: tmo,
        other_carrier_mapping_status: other,
        registration_synced_at: syncedAt,
      })
      .eq('id', n.id);

    // supabase-js returns { error }, it does not throw.
    if (upErr) console.error(`syncNumberRegistration: update failed for ${n.phone_number}:`, upErr);
    else updated++;
  }

  return updated;
}

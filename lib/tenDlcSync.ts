// Syncing one 10DLC registration against live Telnyx state.
//
// Extracted from /api/telnyx/10dlc/refresh so the Settings button and the cron
// share it. #1 listed "status refresh is manual (a button), not on a cron" as
// open, and a registration that only updates when somebody clicks is a
// registration nobody knows the state of: the one row on this account sat seven
// days stale while its campaign was already ACTIVE.
//
// Same rule as lib/cronAuth's confirmOverdueAgainstTable and lib/smsGuard — one
// implementation, because a hand-rolled copy of a shared gate drifts.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getBrandStatus, getCampaignStatus, mapBrandStatus, mapCampaignStatus,
  listCampaignsForBrand, pickUsableCampaign,
} from '@/lib/telnyx10dlc';
import { assignAllUserNumbersToCampaign } from '@/lib/autoAssignCampaignNumber';

export interface TenDlcRegistrationRow {
  id: string;
  user_id: string;
  brand_id: string | null;
  brand_status: string;
  campaign_id: string | null;
  campaign_status: string;
}

export interface TenDlcSyncOutcome {
  /** Fields written to user_10dlc_registrations. Always includes updated_at. */
  updates: Record<string, any>;
  /** The campaign was not active before this sync and is now. */
  campaignBecameActive: boolean;
  /** A live campaign was adopted because the stored id pointed at a dead one. */
  adoptedCampaignId: string | null;
  /** Numbers submitted for assignment as a result. */
  numbersAssigned: number;
}

/**
 * Re-check one registration against Telnyx and write back what changed.
 *
 * Writes the row itself, and — when the campaign has just become usable —
 * attaches any numbers the user already owns. Does NOT throw: a Telnyx blip on
 * one user's registration must not abort a sweep over everyone else's.
 */
export async function syncTenDlcRegistration(
  admin: SupabaseClient,
  registration: TenDlcRegistrationRow
): Promise<TenDlcSyncOutcome> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  let adoptedCampaignId: string | null = null;
  let numbersAssigned = 0;

  if (registration.brand_id && registration.brand_status === 'pending') {
    const brandResult = await getBrandStatus(registration.brand_id);
    if (brandResult.success) {
      updates.brand_status = mapBrandStatus(brandResult.status);
    }
  }

  // Re-check whenever the campaign is not already usable. This used to run only
  // while status === 'pending', which meant a campaign that had gone 'failed'
  // was never looked at again — and 'failed' includes EXPIRED, the state a
  // superseded campaign lands in (#1).
  if (registration.campaign_id && registration.campaign_status !== 'active') {
    const campaignResult = await getCampaignStatus(registration.campaign_id);
    if (campaignResult.success) {
      updates.campaign_status = mapCampaignStatus(campaignResult.status);
      updates.campaign_failure_reason = campaignResult.failureReasons?.join(' | ') || null;
    }
  }

  // The stored campaign is dead (or was never set) — see whether the brand has a
  // live one and adopt it.
  //
  // Telnyx does not update a campaign id when a rejected campaign is
  // resubmitted; it issues a new one and leaves the old id resolving happily as
  // EXPIRED. So the app can sit on a pointer to a corpse while a perfectly good
  // campaign exists under the same brand — precisely the state this account was
  // in, with the approved campaign holding 0 numbers because every assignment
  // targeted the superseded id.
  const campaignUsable = (updates.campaign_status ?? registration.campaign_status) === 'active';
  if (registration.brand_id && !campaignUsable) {
    const list = await listCampaignsForBrand(registration.brand_id);
    const usable = pickUsableCampaign(list.campaigns);
    if (usable && usable.campaignId !== registration.campaign_id) {
      console.log(
        `📇 Adopting live campaign ${usable.campaignId} for user ${registration.user_id} ` +
        `(was ${registration.campaign_id ?? 'none'})`
      );
      updates.campaign_id = usable.campaignId;
      updates.campaign_status = 'active';
      updates.campaign_failure_reason = null;
      adoptedCampaignId = usable.campaignId;
    }
  }

  const { error: writeError } = await admin
    .from('user_10dlc_registrations')
    .update(updates)
    .eq('id', registration.id);

  if (writeError) {
    // Checked rather than discarded: a silent failure here means the row keeps
    // reporting a status Telnyx no longer agrees with, which is the condition
    // this whole function exists to prevent.
    console.error(`10DLC sync: failed to write registration ${registration.id}:`, writeError);
    return { updates, campaignBecameActive: false, adoptedCampaignId, numbersAssigned: 0 };
  }

  // The campaign just became usable, and this user may already own numbers
  // bought before it was approved. Attach them now rather than leaving the user
  // to find a button in Settings — an unattached number has its A2P traffic
  // filtered by carriers, which presents as "sending is broken" (#107).
  const campaignBecameActive =
    updates.campaign_status === 'active' && registration.campaign_status !== 'active';

  if (campaignBecameActive) {
    numbersAssigned = await assignAllUserNumbersToCampaign(registration.user_id);
    const activeCampaign = updates.campaign_id ?? registration.campaign_id;
    if (numbersAssigned > 0) {
      console.log(`📇 Campaign ${activeCampaign} approved — submitted ${numbersAssigned} number(s) for assignment`);
    }
  }

  return { updates, campaignBecameActive, adoptedCampaignId, numbersAssigned };
}

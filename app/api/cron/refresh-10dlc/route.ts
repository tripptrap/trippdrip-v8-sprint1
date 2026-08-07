// Cron: keep 10DLC brand/campaign status in step with Telnyx.
//
// #1 listed "status refresh is manual (a button), not on a cron" as open, and the
// consequence showed up immediately: the one registration on this account sat
// SEVEN DAYS stale while its campaign had already gone ACTIVE. Nobody knew,
// because knowing required someone to open Settings and click.
//
// That staleness is not cosmetic. When a campaign becomes active, numbers the
// user already owns have to be attached to it — until they are, carriers filter
// their A2P traffic and it presents as "sending is broken" (#107). The sooner the
// transition is noticed, the shorter that window.
//
// Runs hourly. Carrier review takes days, so anything faster is noise; anything
// slower leaves a user unable to send for longer than necessary after approval.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { syncTenDlcRegistration, type TenDlcRegistrationRow } from '@/lib/tenDlcSync';
import { notifyAdmins } from '@/lib/createNotification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Each registration costs two or three Telnyx round trips. Every other
// work-doing cron sets this; auto-buy not setting it is what made it the one
// most likely to be killed mid-loop (#171).
export const maxDuration = 60;

/** Settled registrations are still re-checked this often — approval is not permanent. */
const SETTLED_RECHECK_HOURS = 24;

export async function GET(req: NextRequest) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  try {
    const admin = createServiceRoleClient();

    const { data: registrations, error } = await admin
      .from('user_10dlc_registrations')
      .select('id, user_id, brand_id, brand_status, campaign_id, campaign_status, updated_at, campaign_content, pending_campaign_usecase, is_mock')
      .eq('is_mock', false);

    if (error) {
      console.error('refresh-10dlc: could not read registrations:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const settledCutoff = Date.now() - SETTLED_RECHECK_HOURS * 60 * 60 * 1000;

    // Unsettled rows every run; settled ones daily. Settled is NOT "done" —
    // a campaign can be revoked, and this account has already lost toll-free
    // verification once, so never checking again would leave the app asserting a
    // registration the carrier has withdrawn.
    const due = (registrations ?? []).filter(r => {
      const settled = r.brand_status === 'verified' && r.campaign_status === 'active';
      if (!settled) return true;
      return Date.parse(r.updated_at) < settledCutoff;
    });

    let synced = 0;
    let activated = 0;
    let adopted = 0;
    let numbersAssigned = 0;
    const failures: string[] = [];

    for (const reg of due) {
      try {
        const outcome = await syncTenDlcRegistration(admin, reg as TenDlcRegistrationRow);
        synced++;
        if (outcome.campaignBecameActive) activated++;
        if (outcome.adoptedCampaignId) adopted++;
        numbersAssigned += outcome.numbersAssigned;

        if (outcome.campaignBecameActive) {
          // Worth an in-app notice: it changes what the account can do.
          await notifyAdmins(
            'fulfillment_failed',
            '10DLC campaign approved',
            `User ${reg.user_id} now has an active 10DLC campaign; ${outcome.numbersAssigned} number(s) submitted for assignment.`,
            { reason: 'tendlc_campaign_active', user_id: reg.user_id, campaign_id: outcome.updates.campaign_id ?? reg.campaign_id }
          );
        }
      } catch (e: any) {
        // One user's Telnyx blip must not abort the sweep over everyone else.
        console.error(`refresh-10dlc: sync failed for registration ${reg.id}:`, e?.message || e);
        failures.push(reg.id);
      }
    }

    console.log(
      `refresh-10dlc: ${synced}/${due.length} synced (${registrations?.length ?? 0} total), ` +
      `${activated} activated, ${adopted} adopted, ${numbersAssigned} number(s) assigned, ${failures.length} failed`
    );

    return NextResponse.json({
      ok: true,
      total: registrations?.length ?? 0,
      due: due.length,
      synced,
      activated,
      adopted,
      numbersAssigned,
      failures,
    });
  } catch (error: any) {
    console.error('Error in GET /api/cron/refresh-10dlc:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

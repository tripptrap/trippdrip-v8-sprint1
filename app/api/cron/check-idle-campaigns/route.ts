// Cron: notice 10DLC campaigns going quiet before the carriers do. (#136)
//
// Telnyx support, 2026-08-04:
//
//   "If a campaign is inactive for I believe 45 days we place it in dormant
//    status. There is a wireless carrier fine/penalty if a campaign is verified
//    and inactive on their networks. So we place the campaign into dormant
//    status to avoid $500 plus fees."
//
// Every agent carries their own campaign, so ordinary churn leaves verified
// campaigns idle. The mechanism that absorbs the penalty is Telnyx's, and we
// neither monitor nor control it.
//
// ── This job does NOT deactivate anything, deliberately ────────────────────
//
// The correct deactivation call is not known. `PUT /10dlc/campaign/{id}` with
// `{"campaignStatus":"DEACTIVATED"}` returns 200 and moves the campaign
// TCR_FAILED -> TCR_PENDING — an edit-and-resubmit, not a deactivation. Verified
// against a mock campaign on 2026-08-04. Guessing again would mean mutating a
// live customer's carrier registration on a hunch.
//
// This project also requires explicit human instruction before any 10DLC request
// is submitted, which a cron cannot have.
//
// So the job measures, warns the customer, and files a work queue
// (deactivation_required_at) that a person acts on. That is the honest boundary:
// the detection is the part that was missing, and it is buildable today.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { createNotification } from '@/lib/createNotification';
import { alertAdminsThrottled } from '@/lib/alerting';
import { warnIfPoolLow } from '@/lib/numberPoolInventory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Telnyx's stated dormancy threshold. Everything below is chosen to stay clear of it. */
const DORMANCY_DAYS = 45;
/** First, gentle warning. Far enough out that a customer can act on it. */
const WARN_DAYS = 30;
/** Second warning, and the point at which a human should be looking. */
const URGENT_DAYS = 40;

interface Registration {
  id: string;
  user_id: string;
  campaign_id: string | null;
  campaign_status: string | null;
  created_at: string;
  idle_warned_at: string | null;
  idle_warned_at_days: number | null;
  deactivation_required_at: string | null;
}

export async function GET(req: NextRequest) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const admin = createServiceRoleClient();
  const now = Date.now();

  try {
    // Only real campaigns. A mock registration has no carrier presence, so it
    // cannot attract a carrier penalty and must not generate alarm.
    const { data: registrations, error: regError } = await admin
      .from('user_10dlc_registrations')
      .select('id, user_id, campaign_id, campaign_status, created_at, idle_warned_at, idle_warned_at_days, deactivation_required_at')
      .eq('is_mock', false)
      .not('campaign_id', 'is', null);

    // supabase-js returns { error }; it does not throw.
    if (regError) {
      console.error('idle-campaigns: could not read registrations:', regError.message);
      return NextResponse.json({ ok: false, error: regError.message }, { status: 500 });
    }

    const rows = (registrations ?? []) as Registration[];
    if (rows.length === 0) {
      // Still check the pool — no registrations does not mean no signups coming.
      const inv = await warnIfPoolLow(admin, { trigger: 'nightly' });
      return NextResponse.json({ ok: true, checked: 0, warned: 0, flagged: 0, poolAvailable: inv?.available ?? null });
    }

    const userIds = rows.map(r => r.user_id);

    // Last outbound traffic per user, derived rather than stored — see the
    // migration for why. Inbound does not count: a campaign is idle to the
    // carriers when nothing is being SENT on it.
    const { data: sent, error: sentError } = await admin
      .from('messages')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false });

    if (sentError) {
      console.error('idle-campaigns: could not read message history:', sentError.message);
      return NextResponse.json({ ok: false, error: sentError.message }, { status: 500 });
    }

    const lastSentByUser = new Map<string, number>();
    for (const m of sent ?? []) {
      // Ordered newest-first, so the first entry per user wins.
      if (!lastSentByUser.has(m.user_id)) {
        lastSentByUser.set(m.user_id, new Date(m.created_at).getTime());
      }
    }

    // Churn signals. A lapsed or suspended account should not be sitting on a
    // verified campaign at all, regardless of how recently it sent.
    const { data: accounts, error: acctError } = await admin
      .from('users')
      .select('id, email, subscription_status, account_status')
      .in('id', userIds);

    if (acctError) {
      console.error('idle-campaigns: could not read accounts:', acctError.message);
      return NextResponse.json({ ok: false, error: acctError.message }, { status: 500 });
    }

    const accountById = new Map((accounts ?? []).map(a => [a.id, a]));

    let warned = 0;
    let flagged = 0;
    let cleared = 0;
    const escalations: string[] = [];

    for (const reg of rows) {
      const account = accountById.get(reg.user_id);

      // A campaign with no traffic ever is idle from its creation date, not from
      // the epoch — otherwise every freshly registered campaign looks abandoned.
      const lastActivity = lastSentByUser.get(reg.user_id) ?? new Date(reg.created_at).getTime();
      const idleDays = Math.floor((now - lastActivity) / 86_400_000);

      const churned =
        (account?.subscription_status && !['active', 'trialing'].includes(account.subscription_status)) ||
        (account?.account_status && account.account_status !== 'active');

      const churnReason = account?.subscription_status && !['active', 'trialing'].includes(account.subscription_status)
        ? 'subscription_lapsed'
        : 'account_suspended';

      // ── Traffic resumed: reset the state machine ─────────────────────────
      //
      // Without this a customer who came back would stay flagged for ever, and
      // would never be warned again the next time they went quiet.
      if (idleDays < WARN_DAYS && !churned) {
        if (reg.idle_warned_at || reg.deactivation_required_at) {
          const { error } = await admin
            .from('user_10dlc_registrations')
            .update({
              idle_warned_at: null,
              idle_warned_at_days: null,
              deactivation_required_at: null,
              deactivation_reason: null,
            })
            .eq('id', reg.id);
          if (error) console.error(`idle-campaigns: could not clear ${reg.id}:`, error.message);
          else cleared++;
        }
        continue;
      }

      // ── Churned, or past the point where a human must act ────────────────
      if (churned || idleDays >= URGENT_DAYS) {
        const reason = churned ? churnReason : 'idle_45d';

        if (!reg.deactivation_required_at) {
          const { error } = await admin
            .from('user_10dlc_registrations')
            .update({
              deactivation_required_at: new Date().toISOString(),
              deactivation_reason: reason,
            })
            .eq('id', reg.id);
          if (error) console.error(`idle-campaigns: could not flag ${reg.id}:`, error.message);
          else flagged++;
        }

        escalations.push(
          `${account?.email ?? reg.user_id} — campaign ${reg.campaign_id}, ${idleDays}d idle, ${reason}`
        );
        continue;
      }

      // ── Approaching the window: tell the customer, once ──────────────────
      //
      // An idle campaign is usually a retention signal before it is a billing
      // event, so the customer hears about it before anyone else does.
      if (idleDays >= WARN_DAYS && reg.idle_warned_at_days !== WARN_DAYS) {
        await createNotification(
          reg.user_id,
          'registration_idle',
          'Your texting registration is going quiet',
          `You haven't sent a message in ${idleDays} days. Carriers put registrations that stay unused for ${DORMANCY_DAYS} days into a dormant state, and waking one back up means re-registering. Send anything in the next couple of weeks and this clears itself.`,
          { campaign_id: reg.campaign_id, idle_days: idleDays, dormancy_days: DORMANCY_DAYS }
        );

        const { error } = await admin
          .from('user_10dlc_registrations')
          .update({ idle_warned_at: new Date().toISOString(), idle_warned_at_days: WARN_DAYS })
          .eq('id', reg.id);
        if (error) console.error(`idle-campaigns: could not record the warning for ${reg.id}:`, error.message);
        else warned++;
      }
    }

    // One throttled alert for the whole batch rather than one per campaign — at
    // scale the per-campaign version would be the thing that trains everyone to
    // ignore these.
    if (escalations.length > 0) {
      await alertAdminsThrottled({
        key: 'idle_10dlc_campaigns',
        title: `${escalations.length} 10DLC campaign(s) need deactivating`,
        body:
          `These are idle past ${URGENT_DAYS} days or belong to churned accounts. Carriers penalise a verified campaign left inactive ` +
          `(Telnyx: dormant at ${DORMANCY_DAYS} days, "$500 plus fees"), and NOTHING deactivates automatically — the correct Telnyx ` +
          `call is still unknown (#136), and this project requires explicit instruction before any 10DLC submission.\n\n` +
          escalations.join('\n'),
        data: { count: escalations.length, urgent_days: URGENT_DAYS, dormancy_days: DORMANCY_DAYS },
        // Delay compounds this one — the penalty accrues while nobody looks.
        escalate: true,
      });
    }

    // Same nightly pass, separate concern: is the toll-free pool running dry?
    // Claim-time checks catch a drain; this catches the case where nobody claims
    // but stock was already low (#120).
    const inventory = await warnIfPoolLow(admin, { trigger: 'nightly' });

    return NextResponse.json({
      ok: true,
      poolAvailable: inventory?.available ?? null,
      checked: rows.length,
      warned,
      flagged,
      cleared,
      needsHumanAction: escalations.length,
    });
  } catch (error: any) {
    console.error('idle-campaigns error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

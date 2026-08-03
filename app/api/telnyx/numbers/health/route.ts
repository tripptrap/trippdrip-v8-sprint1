// Per-number health, and whether a number should be rested (#122).
//
// Two independent signals, deliberately kept separate rather than blended into
// one score:
//
//   opt-out rate   ours. How many people told THIS number to stop, over how
//                  many messages it sent. Directly actionable by the agent.
//   spam ratio     Telnyx's. What carriers think of the number. Slower to move
//                  and not something the agent controls directly, but it is the
//                  thing that actually gets messages filtered.
//
// A blended score would hide which of the two is wrong, and they call for
// different responses — a high opt-out rate means the messaging is off, a high
// spam ratio means the number's reputation is already damaged.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getNumberHealth } from '@/lib/telnyx';
import { SPAM_RATIO_LIMIT } from '@/lib/numberPool';
import { OPT_OUT_WATCH, OPT_OUT_REST, MIN_SENDS_FOR_A_VERDICT } from '@/lib/riskTier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Opt-out thresholds.
 *
 * **These are starting points, not measured from this product's data** — there
 * is not enough of it yet. Carrier guidance for marketing SMS generally treats
 * low single-digit percentages as healthy, so 3% warns and 5% recommends
 * resting. `SPAM_RATIO_LIMIT` is reused from the pool logic (#38) so the two
 * places that judge a number's reputation agree.
 *
 * Revisit once there is real volume; a threshold nobody has checked against
 * reality is a guess with a constant's confidence.
 */
// Imported rather than redeclared (#123 gap 4). These same thresholds now also
// drive the automatic risk tier in lib/riskTier, and two places judging "is this
// opt-out rate bad" must not be able to drift to different answers.

/** Below this, a rate is noise — 1 opt-out in 4 sends is 25% and means nothing. */


type Verdict = 'ok' | 'low_volume' | 'watch' | 'rest';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 365);
    const admin = createServiceRoleClient();

    const { data: stats, error } = await admin.rpc('get_number_health_stats', {
      p_user_id: user.id,
      p_days: days,
    });
    if (error) {
      console.error('get_number_health_stats failed:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (stats || []) as { phone_number: string; sent: number; opt_outs: number; opt_out_rate: number }[];

    // Telnyx health is one API round trip per number. Fetched in parallel, and
    // a failure degrades to "carrier data unavailable" rather than failing the
    // whole view — the opt-out half is still worth showing on its own.
    const carrier = await Promise.all(
      rows.map(async r => {
        try {
          const h = await getNumberHealth(r.phone_number);
          return h.ok ? { spamRatio: h.spamRatio, successRatio: h.successRatio, messageCount: h.messageCount } : null;
        } catch {
          return null;
        }
      })
    );

    const numbers = rows.map((r, i) => {
      const c = carrier[i];
      const rate = Number(r.opt_out_rate) || 0;

      let verdict: Verdict;
      let advice: string;

      if (c && c.spamRatio > SPAM_RATIO_LIMIT) {
        verdict = 'rest';
        advice = `Carriers are flagging this number (spam ratio ${(c.spamRatio * 100).toFixed(1)}%). Rest it and send from another while its reputation recovers.`;
      } else if (r.sent < MIN_SENDS_FOR_A_VERDICT) {
        verdict = 'low_volume';
        advice = `Only ${r.sent} message${r.sent === 1 ? '' : 's'} in ${days} days — not enough to judge yet.`;
      } else if (rate >= OPT_OUT_REST) {
        verdict = 'rest';
        advice = `${(rate * 100).toFixed(1)}% of people who got a message from this number opted out. Rest it for a week and review what you are sending.`;
      } else if (rate >= OPT_OUT_WATCH) {
        verdict = 'watch';
        advice = `${(rate * 100).toFixed(1)}% opt-out rate — higher than usual. Worth checking your message wording before it gets worse.`;
      } else {
        verdict = 'ok';
        advice = 'Healthy.';
      }

      return {
        phone_number: r.phone_number,
        sent: r.sent,
        opt_outs: r.opt_outs,
        opt_out_rate: rate,
        spam_ratio: c?.spamRatio ?? null,
        success_ratio: c?.successRatio ?? null,
        carrier_data: c !== null,
        verdict,
        advice,
      };
    });

    return NextResponse.json({ ok: true, days, numbers });
  } catch (error: any) {
    console.error('Error in GET /api/telnyx/numbers/health:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

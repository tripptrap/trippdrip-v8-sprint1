// Routing controls for a user's own numbers (#122).
//
// Four actions behind one route so the ownership check exists once rather than
// four times — the pattern that produced #110 and #114 was the same guard
// written repeatedly and getting it wrong somewhere.
//
//   set_primary   which number routing falls back to
//   lock          keep using this one; ignore geo for a while
//   rest          take this one out of rotation ("ghost" it) so its carrier
//                 reputation can recover
//   clear         drop both timers on a number
//
// Lock and rest are opposites, so setting one clears the other. Holding both at
// once has no coherent meaning — "always use this" and "never use this".

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Action = 'set_primary' | 'lock' | 'rest' | 'clear' | 'set_mode';

/** Rest defaults to a week: long enough for carrier reputation to settle, short
 *  enough that a forgotten number comes back on its own. */
const DEFAULT_REST_HOURS = 168;
const DEFAULT_LOCK_HOURS = 168;
const MAX_HOURS = 24 * 90;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as Action;
    const admin = createServiceRoleClient();

    // ── Routing mode is per user, not per number ────────────────────────────
    if (action === 'set_mode') {
      const mode = body.mode;
      if (mode !== 'geo' && mode !== 'primary') {
        return NextResponse.json({ ok: false, error: "mode must be 'geo' or 'primary'" }, { status: 400 });
      }
      const { data, error } = await admin
        .from('user_settings')
        .upsert({ user_id: user.id, number_selection_mode: mode }, { onConflict: 'user_id' })
        .select('number_selection_mode');
      if (error) {
        console.error('set_mode failed:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: data?.[0]?.number_selection_mode ?? mode });
    }

    const phoneNumber = (body.phoneNumber || '').trim();
    if (!phoneNumber) {
      return NextResponse.json({ ok: false, error: 'phoneNumber is required' }, { status: 400 });
    }

    // Ownership is enforced by the `.eq('user_id', user.id)` on every write
    // below, and `.select()` is what makes "not yours" distinguishable from
    // "done" — a guarded UPDATE matching zero rows returns error: null (#110).
    const hours = Math.min(Math.max(Number(body.hours) || 0, 0), MAX_HOURS);
    const until = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

    let patch: Record<string, any>;
    switch (action) {
      case 'lock':
        patch = { locked_until: until(hours || DEFAULT_LOCK_HOURS), rested_until: null, rest_reason: null };
        break;
      case 'rest':
        patch = {
          rested_until: until(hours || DEFAULT_REST_HOURS),
          rest_reason: (body.reason || '').trim() || null,
          locked_until: null,
        };
        break;
      case 'clear':
        patch = { locked_until: null, rested_until: null, rest_reason: null };
        break;
      case 'set_primary':
        patch = { is_primary: true };
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Only one primary per user — there is a unique partial index on
    // (user_id) WHERE is_primary, so the old one must be cleared first or the
    // insert violates it (#104).
    if (action === 'set_primary') {
      const { error: demoteError } = await admin
        .from('user_telnyx_numbers')
        .update({ is_primary: false })
        .eq('user_id', user.id)
        .neq('phone_number', phoneNumber);
      if (demoteError) {
        console.error('set_primary: could not demote existing primary:', demoteError);
        return NextResponse.json({ ok: false, error: demoteError.message }, { status: 500 });
      }
    }

    const { data: updated, error } = await admin
      .from('user_telnyx_numbers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('phone_number', phoneNumber)
      .select('phone_number, is_primary, locked_until, rested_until, rest_reason');

    if (error) {
      console.error(`Number control "${action}" failed:`, error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!updated?.length) {
      return NextResponse.json({ ok: false, error: 'Number not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, number: updated[0] });
  } catch (error: any) {
    console.error('Error in POST /api/telnyx/numbers/controls:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

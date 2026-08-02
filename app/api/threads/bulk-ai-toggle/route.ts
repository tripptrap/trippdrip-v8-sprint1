import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Bulk toggle AI on/off for threads.
 * - leadIds: toggle AI for threads linked to these leads
 * - all: true to toggle ALL threads for the user
 * - disable: true = disable AI, false = enable AI
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leadIds, threadIds, disable, all, contactType } = body;

    if (!all && !leadIds?.length && !threadIds?.length) {
      return NextResponse.json({ ok: false, error: 'leadIds, threadIds, or all=true required' }, { status: 400 });
    }

    let query = supabase
      .from('threads')
      .update({ ai_disabled: disable === true })
      .eq('user_id', user.id);

    // Filter by contact type (lead vs client) — contact_type is computed, not a column
    if (contactType === 'client') {
      // Get all client lead_ids, then filter threads to those
      const { data: clients } = await supabase
        .from('clients')
        .select('original_lead_id')
        .eq('user_id', user.id);
      const clientLeadIds = (clients || []).map(c => c.original_lead_id).filter(Boolean);
      if (clientLeadIds.length > 0) {
        query = query.in('lead_id', clientLeadIds);
      } else {
        return NextResponse.json({ ok: true, updated: 0 });
      }
    } else if (contactType === 'lead') {
      // Get client lead_ids to exclude them
      const { data: clients } = await supabase
        .from('clients')
        .select('original_lead_id')
        .eq('user_id', user.id);
      const clientLeadIds = (clients || []).map(c => c.original_lead_id).filter(Boolean);
      if (clientLeadIds.length > 0) {
        // Use filter with not.in operator for correct Supabase syntax
        query = query.filter('lead_id', 'not.in', `(${clientLeadIds.join(',')})`);
      }
    }

    if (!all) {
      if (threadIds?.length) {
        query = query.in('id', threadIds);
      } else if (leadIds?.length) {
        query = query.in('lead_id', leadIds);
      }
    }

    const { data, error } = await query.select('id');

    if (error) {
      // Previously: an error mentioning `ai_disabled` returned `ok: true,
      // updated: 0` on the theory that the column might not exist (#110).
      //
      // It does exist — `threads.ai_disabled`, boolean, default false — so that
      // branch was unreachable defensive code guarding against nothing. What it
      // *would* have done is report success for a write that never happened:
      // the user flips "AI off", the UI confirms, and the AI keeps replying on
      // their behalf. Any Postgres error naming the column in its message
      // (a permission error, a type error, a policy violation) triggered it.
      //
      // This is the shape that hid the STOP opt-out failure for months and the
      // dead cron for longer: report success, do nothing, surface nothing.
      console.error('Error toggling AI in bulk:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updated: data?.length || 0,
      ai_disabled: disable === true,
    });

  } catch (error: any) {
    console.error('Error in bulk AI toggle:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

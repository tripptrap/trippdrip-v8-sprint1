import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch quiet hours settings
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get quiet hours settings from users table
    const { data: userData, error } = await supabase
      .from('users')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching quiet hours:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      quietHours: {
        enabled: userData?.quiet_hours_enabled ?? true,
        start: userData?.quiet_hours_start ?? '08:00:00',
        end: userData?.quiet_hours_end ?? '20:00:00',
        timezone: userData?.timezone ?? 'America/New_York'
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/settings/quiet-hours:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST - Update quiet hours settings
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { enabled, start, end, timezone } = body;

    // Validate time format (HH:MM or HH:MM:SS)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (start && !timeRegex.test(start)) {
      return NextResponse.json({ ok: false, error: 'Invalid start time format' }, { status: 400 });
    }
    if (end && !timeRegex.test(end)) {
      return NextResponse.json({ ok: false, error: 'Invalid end time format' }, { status: 400 });
    }

    // A bad timezone is not cosmetic: is_within_quiet_hours() resolves the window
    // in this zone, so an unrecognised string means the window cannot be evaluated
    // at all. Validate against the runtime's own zone list rather than a hand-kept
    // one, which would drift.
    if (timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        return NextResponse.json({ ok: false, error: 'Unrecognised timezone' }, { status: 400 });
      }
    }

    // Update quiet hours settings
    const updates: any = {};
    if (enabled !== undefined) updates.quiet_hours_enabled = enabled === true;
    if (start !== undefined) updates.quiet_hours_start = start.length === 5 ? `${start}:00` : start;
    if (end !== undefined) updates.quiet_hours_end = end.length === 5 ? `${end}:00` : end;
    if (timezone !== undefined) updates.timezone = timezone;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
    }

    // SERVICE ROLE. `authenticated` may UPDATE exactly four columns of public.users
    // and three of these are not among them — verified live, with timezone as the
    // control that proves the difference:
    //
    //   quiet_hours_enabled  authenticated: false   service_role: true
    //   quiet_hours_start    authenticated: false   service_role: true
    //   quiet_hours_end      authenticated: false   service_role: true
    //   timezone             authenticated: TRUE    service_role: true
    //
    // So this failed with 42501 for every combination except a timezone-only save,
    // and a mixed update failed wholesale because the statement named a column the
    // role could not write. Saving quiet hours has never once worked: all 7
    // accounts still hold byte-identical defaults (08:00-20:00 America/New_York).
    //
    // Unlike #159 this route did check its error and return 500, so it failed
    // loudly rather than lying — but the user still could not turn quiet hours off,
    // or narrow them, and messages kept sending on the stored window (#178).
    //
    // user.id comes from the verified session above, never from the request body.
    const { error } = await createServiceRoleClient()
      .from('users')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      console.error('Error updating quiet hours:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Quiet hours updated successfully' });
  } catch (error: any) {
    console.error('Error in POST /api/settings/quiet-hours:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

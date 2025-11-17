import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Update quiet hours settings
    const updates: any = {};
    if (enabled !== undefined) updates.quiet_hours_enabled = enabled;
    if (start !== undefined) updates.quiet_hours_start = start.length === 5 ? `${start}:00` : start;
    if (end !== undefined) updates.quiet_hours_end = end.length === 5 ? `${end}:00` : end;
    if (timezone !== undefined) updates.timezone = timezone;

    const { error } = await supabase
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

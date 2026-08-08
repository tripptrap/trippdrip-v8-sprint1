import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Default state for users without onboarding_state
const DEFAULT_STATE = {
  phone_selected: false,
  theme_selected: false,
  tour_completed: false,
  completed: false,
};

// GET - Fetch onboarding state
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('users')
      .select('onboarding_state')
      .eq('id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      state: data?.onboarding_state || DEFAULT_STATE,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update specific onboarding state fields
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const updates = await req.json();

    // Validate only allowed keys
    const allowedKeys = ['phone_selected', 'theme_selected', 'tour_completed', 'completed'];
    const filtered: Record<string, boolean> = {};
    for (const key of allowedKeys) {
      if (key in updates) {
        filtered[key] = Boolean(updates[key]);
      }
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Get current state, merge updates
    const { data: current } = await supabase
      .from('users')
      .select('onboarding_state')
      .eq('id', user.id)
      .single();

    const currentState = current?.onboarding_state || DEFAULT_STATE;
    const newState = { ...currentState, ...filtered };

    // Service role for the WRITE, user client for the reads above.
    //
    // `authenticated` holds column-level UPDATE on public.users for exactly four
    // columns — business_hours, business_name, timezone, updated_at. Not
    // onboarding_state. So every write here failed with "permission denied for
    // table users", and had done since the column was added.
    //
    // Nothing surfaced it. OnboardingContext applies updates optimistically and
    // only adopts the server's reply when `data.ok` is set, so a failed PATCH
    // left the browser believing the flag had stuck while the database never
    // moved. On the next load the state reset to all-false, and the theme picker
    // and product tour reappeared — permanently, for every user, with no way to
    // dismiss them for good.
    //
    // Still scoped to the caller's own row by `.eq('id', user.id)`: the elevated
    // client bypasses RLS, so that filter is the only thing standing between this
    // and someone else's record.
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('users')
      .update({ onboarding_state: newState })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, state: newState });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching preferences:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      preferences: preferences || {},
    });

  } catch (error: any) {
    console.error('Error in GET /api/user/preferences:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const updates: any = {};

    // Map camelCase to snake_case for database
    if (body.calendarBookingUrl !== undefined) {
      updates.calendar_booking_url = body.calendarBookingUrl;
    }
    if (body.calendarType !== undefined) {
      updates.calendar_type = body.calendarType;
    }
    if (body.theme !== undefined) {
      updates.theme = body.theme;
    }
    if (body.compactView !== undefined) {
      updates.compact_view = body.compactView;
    }
    if (body.itemsPerPage !== undefined) {
      updates.items_per_page = body.itemsPerPage;
    }
    if (body.enableSmartReplies !== undefined) {
      updates.enable_smart_replies = body.enableSmartReplies;
    }
    if (body.enableAiSuggestions !== undefined) {
      updates.enable_ai_suggestions = body.enableAiSuggestions;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        ...updates,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating preferences:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      preferences: data,
    });

  } catch (error: any) {
    console.error('Error in PUT /api/user/preferences:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

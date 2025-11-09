import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Clear Google Calendar tokens
    const { error: updateError } = await supabase
      .from('users')
      .update({
        google_calendar_access_token: null,
        google_calendar_refresh_token: null,
        google_calendar_token_expiry: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error disconnecting calendar:', updateError);
      return NextResponse.json({ error: 'Failed to disconnect calendar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Calendar disconnect error:', error);
    return NextResponse.json({ error: error.message || 'Failed to disconnect calendar' }, { status: 500 });
  }
}

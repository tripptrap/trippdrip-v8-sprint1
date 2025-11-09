import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('google_calendar_refresh_token')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error checking calendar status:', error);
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: !!userData?.google_calendar_refresh_token
    });
  } catch (error: any) {
    console.error('Calendar status check error:', error);
    return NextResponse.json({ connected: false });
  }
}

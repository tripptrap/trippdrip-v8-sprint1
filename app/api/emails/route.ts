import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch emails for current user
    const { data: emails, error } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('Error fetching emails:', error);
      return NextResponse.json(
        { ok: false, items: [], error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, items: emails || [] });
  } catch (error: any) {
    console.error('Error in GET /api/emails:', error);
    return NextResponse.json(
      { ok: false, items: [], error: error.message || 'Failed to load emails' },
      { status: 500 }
    );
  }
}

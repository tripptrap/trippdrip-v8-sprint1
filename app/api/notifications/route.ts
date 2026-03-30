import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET — fetch recent notifications for the current user
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ ok: false, notifications: [] }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unread') === 'true';

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) throw error;

    const unreadCount = (data || []).filter(n => !n.is_read).length;

    return NextResponse.json({ ok: true, notifications: data || [], unreadCount });
  } catch (error: any) {
    return NextResponse.json({ ok: false, notifications: [], error: error.message }, { status: 500 });
  }
}

// PATCH — mark notifications as read
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json();
    const { ids, markAllRead } = body; // ids: string[] | markAllRead: true

    const now = new Date().toISOString();

    if (markAllRead) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('user_id', user.id)
        .eq('is_read', false);
    } else if (ids && ids.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .in('id', ids)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

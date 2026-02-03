import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, entries: [], error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const action = searchParams.get('action'); // filter by action type
    const phone = searchParams.get('phone'); // search by phone number

    let query = supabase
      .from('dnc_history')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (action && action !== 'all') {
      query = query.eq('action', action);
    }
    if (phone) {
      query = query.or(`phone_number.ilike.%${phone}%,normalized_phone.ilike.%${phone}%`);
    }

    const { data: entries, error, count } = await query;

    if (error) {
      console.error('Error fetching DNC history:', error);
      return NextResponse.json({ ok: false, entries: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      entries: entries || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Error in GET /api/dnc/history:', error);
    return NextResponse.json({ ok: false, entries: [], error: error.message }, { status: 500 });
  }
}

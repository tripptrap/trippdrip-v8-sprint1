import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch campaigns from Supabase
    const { data: items, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: items || [] });
  } catch (error: any) {
    console.error('Error in GET /api/campaigns:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

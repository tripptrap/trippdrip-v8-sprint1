import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  campaign?: string;
  status?: string;
  [k: string]: any;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tags = (url.searchParams.get("tags") || "").split(",").map(s=>s.trim()).filter(Boolean);
  const campaign = (url.searchParams.get("campaign") || "").trim();

  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Build query
    let query = supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id);

    // Apply search filter (if provided)
    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,state.ilike.%${q}%,status.ilike.%${q}%`);
    }

    // Apply campaign filter (if provided)
    if (campaign) {
      query = query.eq('campaign', campaign);
    }

    // Execute query
    const { data: items, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    // Filter by tags in memory (since Supabase doesn't support array filtering easily in this way)
    let filteredItems = items || [];
    if (tags.length > 0) {
      filteredItems = filteredItems.filter(lead => {
        const leadTags = Array.isArray(lead.tags) ? lead.tags : [];
        return tags.every(tag => leadTags.includes(tag));
      });
    }

    return NextResponse.json({ ok: true, items: filteredItems });
  } catch (error: any) {
    console.error('Error in GET /api/leads:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

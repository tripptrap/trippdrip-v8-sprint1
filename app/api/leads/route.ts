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

  // Advanced filters
  const status = url.searchParams.get("status");
  const disposition = url.searchParams.get("disposition");
  const temperature = url.searchParams.get("temperature");
  const source = url.searchParams.get("source");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const sortBy = url.searchParams.get("sortBy") || "created_at";
  const sortOrder = url.searchParams.get("sortOrder") || "desc";

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

    // Apply search filter (searches across multiple fields)
    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
    }

    // Apply status filter
    if (status) {
      query = query.eq('status', status);
    }

    // Apply disposition filter
    if (disposition) {
      query = query.eq('disposition', disposition);
    }

    // Apply temperature filter
    if (temperature) {
      query = query.eq('temperature', temperature);
    }

    // Apply source filter
    if (source) {
      query = query.eq('source', source);
    }

    // Apply campaign filter
    if (campaign) {
      query = query.eq('campaign', campaign);
    }

    // Apply date range filters
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy, { ascending });

    // Execute query
    const { data: items, error } = await query;

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

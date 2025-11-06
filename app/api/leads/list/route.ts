import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const tagsParam = (searchParams.get("tags") || "").trim();
    const selectedTags = tagsParam
      ? tagsParam.split(",").map(t => t.trim()).filter(Boolean)
      : [];

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch all leads for current user
    const { data: all, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const leads = all || [];

    // Extract all tags
    const tagsAll = uniq(
      leads.flatMap(l => Array.isArray(l.tags) ? l.tags.filter(Boolean) : [])
    ).sort((a, b) => a.localeCompare(b));

    // Filter leads
    const filtered = leads.filter(l => {
      const matchesTags =
        selectedTags.length === 0 ||
        (Array.isArray(l.tags) && l.tags.some((t: string) => selectedTags.includes(t)));

      if (!matchesTags) return false;
      if (!search) return true;

      const hay = [
        l.first_name,
        l.last_name,
        l.email,
        l.phone,
        l.state,
        ...(Array.isArray(l.tags) ? l.tags : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(search);
    });

    return NextResponse.json({
      items: filtered,
      total: filtered.length,
      tagsAll,
    });
  } catch (e: any) {
    console.error('Error in GET /api/leads/list:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

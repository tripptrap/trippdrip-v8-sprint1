import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateRequest, dbFor } from '@/lib/apiAuth';

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

    let supabase = await createClient();

    // Get current user
    // Session OR Bearer token (#147). The browser extension sends
    // `Authorization: Bearer <token>` and carries no cookies, so the
    // cookie-only check answered 401 to every request it ever made.
    // authenticateRequest tries the session first, so dashboard behaviour
    // is unchanged.
    const caller = await authenticateRequest(req);
    const user = caller ? { id: caller.id, email: caller.email } : null;
    const authError = caller ? null : new Error('Not authenticated');

    // A Bearer caller has no database session, so the cookie-backed client
    // would run their queries as `anon` — reads come back empty and writes
    // fail RLS. dbFor() hands them the service-role client instead; the
    // route's own user_id filters are then the tenant boundary (#132).
    if (caller) supabase = await dbFor(caller);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch all tags for the user (lightweight — tags column only)
    const { data: tagRows } = await supabase
      .from('leads')
      .select('tags')
      .eq('user_id', user.id);

    const tagsAll = uniq(
      (tagRows || []).flatMap(l => Array.isArray(l.tags) ? l.tags.filter(Boolean) : [])
    ).sort((a: string, b: string) => a.localeCompare(b));

    // Build filtered query pushed to DB
    let query = supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    if (selectedTags.length > 0) {
      query = query.overlaps('tags', selectedTags);
    }

    const { data: filtered, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      items: filtered || [],
      total: (filtered || []).length,
      tagsAll,
    });
  } catch (e: any) {
    console.error('Error in GET /api/leads/list:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

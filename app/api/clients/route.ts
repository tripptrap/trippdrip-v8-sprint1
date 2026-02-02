import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tags = (url.searchParams.get("tags") || "").split(",").map(s => s.trim()).filter(Boolean);
  const campaignId = url.searchParams.get("campaign_id");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: "Not authenticated" }, { status: 401 });
    }

    let query = supabase
      .from("clients")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    if (tags.length > 0) {
      query = query.contains("tags", tags);
    }

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    const offset = (page - 1) * pageSize;
    query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error("Error fetching clients:", error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.phone) {
      return NextResponse.json({ ok: false, error: "Phone is required" }, { status: 400 });
    }

    const clientData = {
      user_id: user.id,
      first_name: body.first_name || "",
      last_name: body.last_name || "",
      phone: body.phone,
      email: body.email || "",
      state: body.state || "",
      zip_code: body.zip_code || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      campaign_id: body.campaign_id || null,
      source: body.source || "",
      notes: body.notes || "",
    };

    const { data, error } = await supabase.from("clients").insert(clientData).select().single();
    if (error) {
      console.error("Error creating client:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, client: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

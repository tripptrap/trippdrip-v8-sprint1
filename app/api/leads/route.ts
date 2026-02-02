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
  const campaignId = url.searchParams.get("campaign_id");

  // Advanced filters
  const status = url.searchParams.get("status");
  const disposition = url.searchParams.get("disposition");
  const temperature = url.searchParams.get("temperature");
  const source = url.searchParams.get("source");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const sortBy = url.searchParams.get("sortBy") || "created_at";
  const sortOrder = url.searchParams.get("sortOrder") || "desc";

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Build query with exact count for pagination
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply search filter (searches across multiple fields)
    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,state.ilike.%${q}%`);
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

    // Apply campaign filter (by name or by ID)
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    } else if (campaign) {
      query = query.eq('campaign', campaign);
    }

    // Apply date range filters
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Filter by tags at the database level using Supabase array contains
    if (tags.length > 0) {
      query = query.contains('tags', tags);
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy, { ascending });

    // Apply pagination
    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    // Execute query
    const { data: items, error, count } = await query;

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: items || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    console.error('Error in GET /api/leads:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();

    // Validate required phone field
    const phone = body.phone?.trim();
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Phone number is required' }, { status: 400 });
    }

    // Check for existing lead with same phone number
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone', phone)
      .single();

    if (existingLead) {
      return NextResponse.json({
        ok: false,
        error: 'duplicate',
        message: 'A lead with this phone number already exists',
        existingLead
      }, { status: 409 });
    }

    // Prepare lead data - only core columns that definitely exist
    const leadData: Lead = {
      user_id: user.id,
      first_name: body.first_name?.trim() || null,
      last_name: body.last_name?.trim() || null,
      phone: phone,
      email: body.email?.trim() || null,
      state: body.state?.trim() || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    // Insert lead
    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lead });
  } catch (error: any) {
    console.error('Error in POST /api/leads:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Check for sort preference
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get('sort') || 'position'; // 'position' or 'name'

    // Fetch tags from tags table - order by position first, then name as fallback
    const { data: tags, error: tagsError } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', user.id)
      .order(sortBy === 'name' ? 'name' : 'position', { ascending: true })
      .order('name', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      return NextResponse.json({ ok: false, items: [], error: tagsError.message }, { status: 500 });
    }

    // Fetch all leads to count tag usage
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('tags')
      .eq('user_id', user.id);

    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
    }

    // Count tag occurrences in leads
    const tagCounts = new Map<string, number>();
    (leads || []).forEach(lead => {
      const leadTags = Array.isArray(lead.tags) ? lead.tags : [];
      leadTags.forEach(tag => {
        const count = tagCounts.get(tag) || 0;
        tagCounts.set(tag, count + 1);
      });
    });

    // Merge tags with counts
    const items = (tags || []).map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      position: tag.position ?? 0,
      count: tagCounts.get(tag.name) || 0,
      created_at: tag.created_at,
      updated_at: tag.updated_at,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error: any) {
    console.error('Error in GET /api/tags:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, color } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Tag name is required' }, { status: 400 });
    }

    // Get max position for new tag
    const { data: maxPos } = await supabase
      .from('tags')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const newPosition = (maxPos?.position ?? 0) + 1;

    // Create tag
    const { data, error } = await supabase
      .from('tags')
      .insert({
        user_id: user.id,
        name: name.trim(),
        color: color || '#3b82f6',
        position: newPosition,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating tag:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in POST /api/tags:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Tag ID is required' }, { status: 400 });
    }

    // Update tag
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;

    const { data, error } = await supabase
      .from('tags')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tag:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Error in PUT /api/tags:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Tag ID is required' }, { status: 400 });
    }

    // Delete tag
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting tag:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/tags:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PATCH - Reorder tags (update positions)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'orderedIds array is required' }, { status: 400 });
    }

    // Update positions for each tag
    const updates = orderedIds.map((id: string, index: number) =>
      supabase
        .from('tags')
        .update({ position: index + 1 })
        .eq('id', id)
        .eq('user_id', user.id)
    );

    await Promise.all(updates);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in PATCH /api/tags:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET - Fetch all tag groups for current user
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    const { data: groups, error } = await supabase
      .from('tag_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching tag groups:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    // Transform to expected format
    const items = (groups || []).map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      tags: g.tag_names || [],
      created_at: g.created_at,
      updated_at: g.updated_at,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error: any) {
    console.error('Error in GET /api/tag-groups:', error);
    return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
  }
}

// POST - Create a new tag group
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, color, tags } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Group name is required' }, { status: 400 });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ ok: false, error: 'At least one tag is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tag_groups')
      .insert({
        user_id: user.id,
        name: name.trim(),
        color: color || '#6366f1',
        tag_names: tags,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating tag group:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: data.id,
        name: data.name,
        color: data.color,
        tags: data.tag_names,
        created_at: data.created_at,
      }
    });
  } catch (error: any) {
    console.error('Error in POST /api/tag-groups:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update a tag group
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, color, tags } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Group ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    if (tags !== undefined) updateData.tag_names = tags;

    const { data, error } = await supabase
      .from('tag_groups')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tag group:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: data.id,
        name: data.name,
        color: data.color,
        tags: data.tag_names,
      }
    });
  } catch (error: any) {
    console.error('Error in PUT /api/tag-groups:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Delete a tag group
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Group ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tag_groups')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting tag group:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/tag-groups:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Conversation Tags Management
 * CRUD operations for user-defined conversation tags
 */

// GET - Fetch all tags with optional usage stats
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const includeStats = searchParams.get('includeStats') === 'true';

    // Get all tags
    const { data: tags, error: tagsError } = await supabase
      .from('conversation_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      return NextResponse.json({ ok: false, error: tagsError.message }, { status: 500 });
    }

    // Get usage stats if requested
    let tagsWithStats = tags;
    if (includeStats) {
      const { data: usageStats, error: statsError } = await supabase
        .rpc('get_tag_usage_stats', { user_id_param: user.id });

      if (!statsError && usageStats) {
        const statsMap = new Map(usageStats.map((s: any) => [s.tag_name, s.usage_count]));
        tagsWithStats = tags?.map(tag => ({
          ...tag,
          usage_count: statsMap.get(tag.name) || 0,
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      tags: tagsWithStats || [],
      count: tagsWithStats?.length || 0,
    });

  } catch (error: any) {
    console.error('Error in GET /api/conversation-tags:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch tags'
    }, { status: 500 });
  }
}

// POST - Create new tag
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, color, description } = body;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Tag name is required' }, { status: 400 });
    }

    // Check if tag already exists
    const { data: existingTag } = await supabase
      .from('conversation_tags')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .single();

    if (existingTag) {
      return NextResponse.json({
        ok: false,
        error: 'A tag with this name already exists'
      }, { status: 409 });
    }

    // Create tag
    const { data: tag, error: createError } = await supabase
      .from('conversation_tags')
      .insert({
        user_id: user.id,
        name,
        color: color || '#3b82f6',
        description: description || null,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating tag:', createError);
      return NextResponse.json({ ok: false, error: createError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      tag,
      message: 'Tag created successfully',
    });

  } catch (error: any) {
    console.error('Error in POST /api/conversation-tags:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to create tag'
    }, { status: 500 });
  }
}

// PUT - Update tag
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, color, description } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Tag ID is required' }, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (description !== undefined) updates.description = description;

    const { data: tag, error: updateError } = await supabase
      .from('conversation_tags')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating tag:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    if (!tag) {
      return NextResponse.json({ ok: false, error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      tag,
      message: 'Tag updated successfully',
    });

  } catch (error: any) {
    console.error('Error in PUT /api/conversation-tags:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to update tag'
    }, { status: 500 });
  }
}

// DELETE - Delete tag
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
      return NextResponse.json({ ok: false, error: 'Tag ID is required' }, { status: 400 });
    }

    // Get tag name before deleting
    const { data: tag } = await supabase
      .from('conversation_tags')
      .select('name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!tag) {
      return NextResponse.json({ ok: false, error: 'Tag not found' }, { status: 404 });
    }

    // Delete tag
    const { error: deleteError } = await supabase
      .from('conversation_tags')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting tag:', deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    // Remove tag from all threads using the SQL function
    const { data: threadsWithTag } = await supabase
      .from('threads')
      .select('id')
      .eq('user_id', user.id)
      .contains('conversation_tags', [tag.name]);

    if (threadsWithTag && threadsWithTag.length > 0) {
      for (const thread of threadsWithTag) {
        await supabase.rpc('remove_thread_tag', {
          thread_id_param: thread.id,
          tag_name: tag.name,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Tag deleted successfully',
    });

  } catch (error: any) {
    console.error('Error in DELETE /api/conversation-tags:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to delete tag'
    }, { status: 500 });
  }
}

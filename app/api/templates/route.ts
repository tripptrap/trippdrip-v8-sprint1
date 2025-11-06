import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET - Fetch all templates or filter by category/channel
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const channel = searchParams.get('channel');
    const favorites = searchParams.get('favorites') === 'true';

    let query = supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', user.id);

    if (category) {
      query = query.eq('category', category);
    }

    if (channel) {
      query = query.or(`channel.eq.${channel},channel.eq.both`);
    }

    if (favorites) {
      query = query.eq('is_favorite', true);
    }

    const { data: templates, error } = await query.order('use_count', { ascending: false });

    if (error) {
      console.error('Error fetching templates:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, templates: templates || [] });
  } catch (error: any) {
    console.error('Error in GET /api/templates:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST - Create new template
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, category, content, channel, subject, isFavorite } = body;

    if (!name || !content) {
      return NextResponse.json({
        ok: false,
        error: 'Name and content are required'
      }, { status: 400 });
    }

    const { data: template, error } = await supabase
      .from('message_templates')
      .insert({
        user_id: user.id,
        name,
        category: category || 'general',
        content,
        channel: channel || 'sms',
        subject: subject || null,
        is_favorite: isFavorite || false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, template });
  } catch (error: any) {
    console.error('Error in POST /api/templates:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update template
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, category, content, channel, subject, isFavorite } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Template ID required' }, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (content !== undefined) updates.content = content;
    if (channel !== undefined) updates.channel = channel;
    if (subject !== undefined) updates.subject = subject;
    if (isFavorite !== undefined) updates.is_favorite = isFavorite;

    const { data: template, error } = await supabase
      .from('message_templates')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!template) {
      return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, template });
  } catch (error: any) {
    console.error('Error in PUT /api/templates:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// DELETE - Delete template
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
      return NextResponse.json({ ok: false, error: 'Template ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Template deleted successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/templates:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

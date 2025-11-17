// API Route: Manage scraper configurations
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: List all scraper configs for user
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const includeTemplates = searchParams.get('templates') === 'true';

    let query = supabase
      .from('scraper_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (includeTemplates) {
      query = query.or(`user_id.eq.${user.id},is_template.eq.true`);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching scrapers:', error);
      return NextResponse.json({ error: 'Failed to fetch scrapers' }, { status: 500 });
    }

    return NextResponse.json({ success: true, scrapers: data || [] });

  } catch (error: any) {
    console.error('Scrapers list error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST: Create new scraper config
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      start_url,
      extraction_rules,
      settings,
      schedule_enabled,
      schedule_frequency,
      schedule_time,
    } = body;

    if (!name || !start_url || !extraction_rules) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract domain from URL
    const target_domain = new URL(start_url).hostname;

    const { data, error } = await supabase
      .from('scraper_configs')
      .insert({
        user_id: user.id,
        name,
        description,
        start_url,
        target_domain,
        extraction_rules,
        settings: settings || {},
        schedule_enabled: schedule_enabled || false,
        schedule_frequency,
        schedule_time,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scraper:', error);
      return NextResponse.json({ error: 'Failed to create scraper' }, { status: 500 });
    }

    return NextResponse.json({ success: true, scraper: data });

  } catch (error: any) {
    console.error('Create scraper error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update scraper config
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Scraper ID is required' }, { status: 400 });
    }

    // Update timestamp
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('scraper_configs')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating scraper:', error);
      return NextResponse.json({ error: 'Failed to update scraper' }, { status: 500 });
    }

    return NextResponse.json({ success: true, scraper: data });

  } catch (error: any) {
    console.error('Update scraper error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete scraper config
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Scraper ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('scraper_configs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting scraper:', error);
      return NextResponse.json({ error: 'Failed to delete scraper' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Scraper deleted successfully' });

  } catch (error: any) {
    console.error('Delete scraper error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

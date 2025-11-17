import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get user's DNC list
    const { data: dncList, error: listError } = await supabase
      .from('dnc_list')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (listError) {
      console.error('Error fetching DNC list:', listError);
      return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('dnc_list')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('Error counting DNC entries:', countError);
    }

    return NextResponse.json({
      ok: true,
      entries: dncList || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error: any) {
    console.error('Error in list DNC route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

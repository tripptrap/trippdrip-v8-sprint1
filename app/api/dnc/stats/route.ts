import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get DNC statistics
    const { data, error } = await supabase.rpc('get_dnc_stats', {
      p_user_id: user.id
    });

    if (error) {
      console.error('Error fetching DNC stats:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const stats = typeof data === 'string' ? JSON.parse(data) : data;

    return NextResponse.json({
      ok: true,
      stats
    });

  } catch (error: any) {
    console.error('Error in stats DNC route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

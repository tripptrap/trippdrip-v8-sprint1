import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch automation analytics statistics
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get days_back parameter from query string (default 30)
    const { searchParams } = new URL(req.url);
    const daysBack = parseInt(searchParams.get('days') || '30', 10);

    // Call the get_automation_stats function
    const { data: stats, error: statsError } = await supabase
      .rpc('get_automation_stats', {
        user_id_param: user.id,
        days_back: daysBack
      });

    if (statsError) {
      console.error('Error fetching automation stats:', statsError);
      return NextResponse.json({ ok: false, error: statsError.message }, { status: 500 });
    }

    // Call the get_flow_performance function
    const { data: flowPerformance, error: flowError } = await supabase
      .rpc('get_flow_performance', {
        user_id_param: user.id,
        flow_id_param: null, // Get all flows
        days_back: daysBack
      });

    if (flowError) {
      console.error('Error fetching flow performance:', flowError);
      return NextResponse.json({ ok: false, error: flowError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      stats: stats || {},
      flowPerformance: flowPerformance || []
    });
  } catch (error: any) {
    console.error('Error in GET /api/analytics/automation:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

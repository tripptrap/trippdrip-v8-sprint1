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

    // Fetch flow completion stats
    let completionRates: Record<string, { completed: number; total: number; rate: number }> = {};
    try {
      const { data: completions } = await supabase
        .from('flow_completion_log')
        .select('campaign_id, steps_completed, total_steps')
        .eq('user_id', user.id);

      const { data: enrollments } = await supabase
        .from('drip_campaign_enrollments')
        .select('campaign_id, status')
        .eq('user_id', user.id);

      if (completions && enrollments) {
        const campaignIds = [...new Set([
          ...completions.map(c => c.campaign_id),
          ...enrollments.map(e => e.campaign_id),
        ])];

        for (const cid of campaignIds) {
          const total = enrollments.filter(e => e.campaign_id === cid).length;
          const completed = completions.filter(c => c.campaign_id === cid).length;
          completionRates[cid] = {
            completed,
            total,
            rate: total > 0 ? Math.round((completed / total) * 100) : 0,
          };
        }
      }
    } catch (compErr) {
      console.warn('Could not fetch completion rates:', compErr);
    }

    return NextResponse.json({
      ok: true,
      stats: stats || {},
      flowPerformance: flowPerformance || [],
      completionRates,
    });
  } catch (error: any) {
    console.error('Error in GET /api/analytics/automation:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// API Route: Flow completion statistics
// Returns per-flow metrics: sessions started, completed, appointments, completion rate

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const flowId = req.nextUrl.searchParams.get('flowId');

    // Get all sessions for this user (optionally filtered by flow)
    let sessionsQuery = supabase
      .from('conversation_sessions')
      .select('id, flow_id, status, appointment_booked, questions_answered, questions_total, completed_at, started_at')
      .eq('user_id', user.id);

    if (flowId) {
      sessionsQuery = sessionsQuery.eq('flow_id', flowId);
    }

    const { data: sessions, error } = await sessionsQuery;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Get completion log entries
    let logQuery = supabase
      .from('flow_completion_log')
      .select('flow_id, completion_type, steps_completed, total_steps')
      .eq('user_id', user.id);

    if (flowId) {
      logQuery = logQuery.eq('flow_id', flowId);
    }

    const { data: completionLogs } = await logQuery;

    // Aggregate stats by flow
    const flowStats: Record<string, {
      flowId: string;
      totalSessions: number;
      completed: number;
      abandoned: number;
      active: number;
      appointmentsBooked: number;
      completionRate: number;
      avgQuestionsAnswered: number;
    }> = {};

    for (const session of sessions || []) {
      const fid = session.flow_id || 'unknown';
      if (!flowStats[fid]) {
        flowStats[fid] = {
          flowId: fid,
          totalSessions: 0,
          completed: 0,
          abandoned: 0,
          active: 0,
          appointmentsBooked: 0,
          completionRate: 0,
          avgQuestionsAnswered: 0,
        };
      }

      flowStats[fid].totalSessions++;
      if (session.status === 'completed') flowStats[fid].completed++;
      else if (session.status === 'abandoned') flowStats[fid].abandoned++;
      else if (session.status === 'active') flowStats[fid].active++;
      if (session.appointment_booked) flowStats[fid].appointmentsBooked++;
    }

    // Calculate rates
    for (const fid of Object.keys(flowStats)) {
      const s = flowStats[fid];
      const finished = s.completed + s.abandoned;
      s.completionRate = finished > 0 ? Math.round((s.completed / finished) * 100) : 0;

      // Average questions from completion logs
      const flowLogs = (completionLogs || []).filter(l => l.flow_id === fid);
      if (flowLogs.length > 0) {
        const totalAnswered = flowLogs.reduce((sum, l) => sum + (l.steps_completed || 0), 0);
        s.avgQuestionsAnswered = Math.round((totalAnswered / flowLogs.length) * 10) / 10;
      }
    }

    return NextResponse.json({
      success: true,
      stats: Object.values(flowStats),
      totalSessions: sessions?.length || 0,
    });

  } catch (error: any) {
    console.error('Error fetching completion stats:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

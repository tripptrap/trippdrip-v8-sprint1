import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Priority Inbox - Returns high-value leads that need immediate attention
 * Prioritizes leads based on:
 * - Temperature (hot > warm > cold)
 * - Score (higher first)
 * - Recent activity
 * - Unanswered messages
 * - Pending follow-ups
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const includeWarm = searchParams.get('includeWarm') !== 'false';

    // Get hot leads (and warm if requested)
    let temperatureFilter = ['hot'];
    if (includeWarm) {
      temperatureFilter.push('warm');
    }

    const { data: priorityLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .in('temperature', temperatureFilter)
      .not('disposition', 'eq', 'sold') // Exclude already converted
      .not('disposition', 'eq', 'do_not_contact') // Exclude DNC
      .order('score', { ascending: false })
      .order('last_contacted', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (leadsError) {
      console.error('Error fetching priority leads:', leadsError);
      return NextResponse.json({ ok: false, error: leadsError.message }, { status: 500 });
    }

    // Get threads for these leads to check for unanswered messages
    const leadIds = (priorityLeads || []).map(l => l.id);

    const { data: threads } = await supabase
      .from('threads')
      .select('lead_id, messages_from_lead, messages_from_user, last_message_at, last_message_from')
      .eq('user_id', user.id)
      .in('lead_id', leadIds);

    // Get pending follow-ups for these leads
    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('lead_id, due_date, priority, title')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .in('lead_id', leadIds);

    // Enrich leads with thread and follow-up data
    const enrichedLeads = (priorityLeads || []).map(lead => {
      const thread = threads?.find(t => t.lead_id === lead.id);
      const leadFollowUps = followUps?.filter(f => f.lead_id === lead.id) || [];

      // Calculate priority factors
      const hasUnansweredMessage = thread?.last_message_from === 'lead';
      const daysSinceContact = lead.last_contacted
        ? Math.floor((Date.now() - new Date(lead.last_contacted).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const hasPendingFollowUp = leadFollowUps.length > 0;
      const hasUrgentFollowUp = leadFollowUps.some(f => f.priority === 'urgent');

      // Calculate priority score (0-100)
      let priorityScore = lead.score || 0;
      if (hasUnansweredMessage) priorityScore += 15;
      if (hasUrgentFollowUp) priorityScore += 10;
      else if (hasPendingFollowUp) priorityScore += 5;
      if (daysSinceContact > 7) priorityScore += 5;

      return {
        ...lead,
        thread_info: {
          messages_sent: thread?.messages_from_user || 0,
          messages_received: thread?.messages_from_lead || 0,
          last_message_at: thread?.last_message_at,
          has_unanswered: hasUnansweredMessage,
        },
        follow_ups: leadFollowUps,
        priority_indicators: {
          unanswered_message: hasUnansweredMessage,
          days_since_contact: daysSinceContact,
          pending_follow_ups: leadFollowUps.length,
          urgent_follow_ups: leadFollowUps.filter(f => f.priority === 'urgent').length,
        },
        priority_score: Math.min(100, priorityScore),
      };
    });

    // Sort by priority score
    enrichedLeads.sort((a, b) => b.priority_score - a.priority_score);

    // Group by reason for being in priority inbox
    const categorized = {
      urgent: enrichedLeads.filter(l =>
        l.priority_indicators.urgent_follow_ups > 0 ||
        l.priority_indicators.unanswered_message
      ),
      hot_leads: enrichedLeads.filter(l =>
        l.temperature === 'hot' &&
        !l.priority_indicators.urgent_follow_ups &&
        !l.priority_indicators.unanswered_message
      ),
      needs_followup: enrichedLeads.filter(l =>
        l.priority_indicators.days_since_contact > 7 &&
        l.temperature === 'warm'
      ),
    };

    return NextResponse.json({
      ok: true,
      leads: enrichedLeads,
      categorized,
      summary: {
        total: enrichedLeads.length,
        urgent: categorized.urgent.length,
        hot: categorized.hot_leads.length,
        needs_followup: categorized.needs_followup.length,
        with_unanswered: enrichedLeads.filter(l => l.priority_indicators.unanswered_message).length,
      },
    });

  } catch (error: any) {
    console.error('Error in priority inbox:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch priority leads'
    }, { status: 500 });
  }
}

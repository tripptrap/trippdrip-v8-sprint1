import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Conversion Funnel Analytics
 * Tracks lead progression through stages and calculates conversion rates
 *
 * Stages:
 * 1. New Leads (status: new)
 * 2. Contacted (status: contacted)
 * 3. Engaged (status: engaged)
 * 4. Qualified (disposition: qualified)
 * 5. Sold (disposition: sold)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const source = searchParams.get('source'); // Optional: filter by source

    // Build base query
    let query = supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id);

    // Apply date filters
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }
    if (source) {
      query = query.eq('source', source);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error('Error fetching leads for funnel:', leadsError);
      return NextResponse.json({ ok: false, error: leadsError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        ok: true,
        funnel: {
          total_leads: 0,
          stages: [],
          conversion_rates: {},
        }
      });
    }

    // Get threads data for engagement metrics
    const leadIds = leads.map(l => l.id);
    const { data: threads } = await supabase
      .from('threads')
      .select('lead_id, messages_from_user, messages_from_lead')
      .eq('user_id', user.id)
      .in('lead_id', leadIds);

    // Build thread lookup for engagement signals
    const threadsMap = new Map(threads?.map(t => [t.lead_id, t]) || []);

    // Calculate funnel stages based on real data signals
    const totalLeads = leads.length;

    // Contacted = we sent them at least one message, or status indicates contact
    const contacted = leads.filter(l => {
      const t = threadsMap.get(l.id);
      return (t && t.messages_from_user > 0) || l.status === 'contacted' || l.status === 'engaged' || l.last_contacted;
    }).length;

    // Engaged = lead replied at least once
    const engaged = leads.filter(l => {
      const t = threadsMap.get(l.id);
      return (t && t.messages_from_lead > 0) || l.status === 'engaged';
    }).length;

    // Sold = disposition is sold, or converted flag, or status is sold
    const sold = leads.filter(l => l.disposition === 'sold' || l.converted === true || l.status === 'sold').length;

    // Calculate conversion rates
    const contactedRate = totalLeads > 0 ? (contacted / totalLeads) * 100 : 0;
    const engagedRate = contacted > 0 ? (engaged / contacted) * 100 : 0;
    const soldRate = engaged > 0 ? (sold / engaged) * 100 : 0;
    const overallConversionRate = totalLeads > 0 ? (sold / totalLeads) * 100 : 0;

    // Calculate average time in each stage (using lead_notes for status changes)
    const { data: notes } = await supabase
      .from('lead_notes')
      .select('lead_id, note_type, content, created_at, metadata')
      .eq('user_id', user.id)
      .eq('note_type', 'status_change')
      .in('lead_id', leadIds);

    // Calculate average messages before conversion
    const soldLeadThreads = leads
      .filter(l => l.disposition === 'sold' || l.converted === true || l.status === 'sold')
      .map(l => threadsMap.get(l.id))
      .filter(Boolean);

    const avgMessagesBeforeSale = soldLeadThreads.length > 0
      ? soldLeadThreads.reduce((sum, t) => sum + (t?.messages_from_user || 0), 0) / soldLeadThreads.length
      : 0;

    // Build funnel stages array
    const stages = [
      {
        name: 'Total Leads',
        count: totalLeads,
        percentage: 100,
        conversion_to_next: contactedRate,
      },
      {
        name: 'Contacted',
        count: contacted,
        percentage: totalLeads > 0 ? (contacted / totalLeads) * 100 : 0,
        conversion_to_next: engagedRate,
      },
      {
        name: 'Engaged',
        count: engaged,
        percentage: totalLeads > 0 ? (engaged / totalLeads) * 100 : 0,
        conversion_to_next: soldRate,
      },
      {
        name: 'Sold',
        count: sold,
        percentage: totalLeads > 0 ? (sold / totalLeads) * 100 : 0,
        conversion_to_next: null,
      },
    ];

    // Group by source for comparison
    const sourceBreakdown = leads.reduce((acc: any, lead) => {
      const src = lead.source || 'unknown';
      if (!acc[src]) {
        acc[src] = {
          total: 0,
          contacted: 0,
          engaged: 0,
          sold: 0,
        };
      }
      acc[src].total++;
      const t = threadsMap.get(lead.id);
      if ((t && t.messages_from_user > 0) || lead.status === 'contacted' || lead.status === 'engaged' || lead.last_contacted) acc[src].contacted++;
      if ((t && t.messages_from_lead > 0) || lead.status === 'engaged') acc[src].engaged++;
      if (lead.disposition === 'sold' || lead.converted === true || lead.status === 'sold') acc[src].sold++;
      return acc;
    }, {});

    // Calculate conversion rates by source
    const sourceStats = Object.entries(sourceBreakdown).map(([source, stats]: [string, any]) => ({
      source,
      total_leads: stats.total,
      conversion_rate: stats.total > 0 ? (stats.sold / stats.total) * 100 : 0,
      engaged_rate: stats.total > 0 ? (stats.engaged / stats.total) * 100 : 0,
    })).sort((a, b) => b.conversion_rate - a.conversion_rate);

    // Time-based analysis (leads by creation date)
    const leadsByDate = leads.reduce((acc: any, lead) => {
      const date = new Date(lead.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { total: 0, sold: 0 };
      }
      acc[date].total++;
      if (lead.disposition === 'sold' || lead.converted === true || lead.status === 'sold') acc[date].sold++;
      return acc;
    }, {});

    const timeSeriesData = Object.entries(leadsByDate)
      .map(([date, stats]: [string, any]) => ({
        date,
        total_leads: stats.total,
        sold: stats.sold,
        conversion_rate: stats.total > 0 ? (stats.sold / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      ok: true,
      funnel: {
        total_leads: totalLeads,
        stages,
        conversion_rates: {
          contacted: contactedRate,
          engaged: engagedRate,
          sold: soldRate,
          overall: overallConversionRate,
        },
        metrics: {
          avg_messages_before_sale: avgMessagesBeforeSale,
          total_sold: sold,
        },
        by_source: sourceStats,
        time_series: timeSeriesData,
      },
      date_range: {
        from: dateFrom || 'all',
        to: dateTo || 'now',
      },
    });

  } catch (error: any) {
    console.error('Error in conversion funnel analytics:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to generate conversion funnel'
    }, { status: 500 });
  }
}

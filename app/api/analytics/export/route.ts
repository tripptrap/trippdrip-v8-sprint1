import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // campaigns, messages, overview
    const format = searchParams.get('format') || 'json'; // json or csv
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    let data: any[] = [];
    let filename = '';

    switch (type) {
      case 'campaigns': {
        let query = supabase
          .from('campaigns')
          .select(`
            id,
            name,
            description,
            status,
            message_template,
            target_audience,
            created_at,
            updated_at
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (dateFrom) query = query.gte('created_at', dateFrom);
        if (dateTo) query = query.lte('created_at', dateTo);

        const { data: campaigns, error } = await query;
        if (error) throw error;

        // Get campaign stats
        for (const campaign of campaigns || []) {
          const { count: messageCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);

          const { count: responseCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('direction', 'in');

          data.push({
            ...campaign,
            messages_sent: messageCount || 0,
            responses: responseCount || 0,
            response_rate: messageCount ? ((responseCount || 0) / messageCount * 100).toFixed(1) + '%' : '0%',
          });
        }

        filename = `campaigns-export-${new Date().toISOString().split('T')[0]}`;
        break;
      }

      case 'messages': {
        let query = supabase
          .from('messages')
          .select(`
            id,
            direction,
            body,
            channel,
            status,
            created_at,
            lead_id,
            campaign_id,
            flow_id,
            leads (
              first_name,
              last_name,
              phone
            ),
            campaigns (
              name
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (dateFrom) query = query.gte('created_at', dateFrom);
        if (dateTo) query = query.lte('created_at', dateTo);

        const { data: messages, error } = await query;
        if (error) throw error;

        data = (messages || []).map((m: any) => ({
          id: m.id,
          direction: m.direction === 'in' ? 'Inbound' : 'Outbound',
          message: m.body,
          channel: m.channel || 'sms',
          status: m.status || 'sent',
          date: m.created_at,
          lead_name: m.leads ? `${m.leads.first_name || ''} ${m.leads.last_name || ''}`.trim() : '',
          lead_phone: m.leads?.phone || '',
          campaign: m.campaigns?.name || '',
          source: m.flow_id ? 'Flow' : m.campaign_id ? 'Campaign' : 'Manual',
        }));

        filename = `messages-export-${new Date().toISOString().split('T')[0]}`;
        break;
      }

      case 'overview': {
        // Fetch comprehensive overview stats
        const [
          { count: totalLeads },
          { count: totalMessages },
          { count: totalCampaigns },
          { count: soldLeads },
          { data: userData },
        ] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('disposition', 'sold'),
          supabase.from('users').select('credits').eq('id', user.id).single(),
        ]);

        const { count: inboundMessages } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('direction', 'in');

        const { count: outboundMessages } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('direction', 'out');

        data = [{
          metric: 'Total Leads',
          value: totalLeads || 0,
        }, {
          metric: 'Sold Leads',
          value: soldLeads || 0,
        }, {
          metric: 'Conversion Rate',
          value: totalLeads ? ((soldLeads || 0) / totalLeads * 100).toFixed(1) + '%' : '0%',
        }, {
          metric: 'Total Messages',
          value: totalMessages || 0,
        }, {
          metric: 'Messages Sent',
          value: outboundMessages || 0,
        }, {
          metric: 'Messages Received',
          value: inboundMessages || 0,
        }, {
          metric: 'Response Rate',
          value: outboundMessages ? ((inboundMessages || 0) / outboundMessages * 100).toFixed(1) + '%' : '0%',
        }, {
          metric: 'Total Campaigns',
          value: totalCampaigns || 0,
        }, {
          metric: 'Current Credits',
          value: userData?.credits || 0,
        }, {
          metric: 'Export Date',
          value: new Date().toISOString(),
        }];

        filename = `analytics-overview-${new Date().toISOString().split('T')[0]}`;
        break;
      }

      default:
        return NextResponse.json({ ok: false, error: 'Invalid export type. Use: campaigns, messages, or overview' }, { status: 400 });
    }

    // Return as JSON or CSV
    if (format === 'csv') {
      if (data.length === 0) {
        return NextResponse.json({ ok: false, error: 'No data to export' }, { status: 404 });
      }

      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = row[h];
            const strVal = val === null || val === undefined ? '' : String(val);
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
              return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
          }).join(',')
        )
      ];

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data,
      count: data.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in analytics export API:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

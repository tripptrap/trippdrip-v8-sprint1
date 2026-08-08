import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// SMS analytics, read from `messages`.
//
// This queried `sms_messages` — a table left over from the previous SMS provider,
// holding one row from 2025-11-28 while `messages` held 118. Nothing has written
// to it since the Telnyx migration, so the analytics section of /analytics (which
// imports this page) showed an empty table to every user, forever, and reported a
// 0% delivery rate as though that were a measurement rather than an absence.
//
// Every column it selected was provider-shaped and none exist on `messages`, so
// this is a rename as well as a repoint. `messages` has no delivered_at/failed_at
// either — `status` is the single source, which is why the badge logic lost its
// two extra arguments.
//
// Verified against the live schema rather than assumed.

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const dateFilter = searchParams.get('dateFilter') || 'all';   // all, today, week, month
    const statusFilter = searchParams.get('statusFilter') || 'all'; // all, delivered, failed, pending

    let query = supabase
      .from('messages')
      .select(`
        id,
        to_phone,
        from_phone,
        body,
        status,
        error_message,
        points_cost,
        created_at,
        lead_id,
        campaign_id,
        lead:lead_id (
          first_name,
          last_name
        )
      `)
      .eq('user_id', user.id)
      // Analytics is about what was sent. Inbound messages are someone else's
      // traffic and have no delivery status of ours to report.
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false });

    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      switch (dateFilter) {
        case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
        case 'week':  startDate = new Date(now.setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.setDate(now.getDate() - 30)); break;
        default:      startDate = new Date(0);
      }
      query = query.gte('created_at', startDate.toISOString());
    }

    // Status lives in one column now, so these are plain equality filters rather
    // than the or()-across-three-columns the old provider shape needed.
    if (statusFilter === 'delivered') {
      query = query.eq('status', 'delivered');
    } else if (statusFilter === 'failed') {
      query = query.eq('status', 'failed');
    } else if (statusFilter === 'pending') {
      query = query.in('status', ['queued', 'sending', 'sent']);
    }

    const { data: rows, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching SMS analytics:', messagesError);
      return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Campaign names are fetched separately, not embedded.
    //
    // `messages.campaign_id` has no foreign key to `campaigns` — only lead_id,
    // thread_id, flow_id and user_id do — so PostgREST refuses to embed it:
    // PGRST200, "Could not find a relationship". That is a 500 for the whole
    // request, not a missing column in the response.
    //
    // Also note the aliases: this returned `leads` and `campaigns` while the page
    // reads `msg.lead` and `msg.campaign`, so neither name has ever rendered.
    const messages = rows ?? [];
    const campaignIds = [...new Set(messages.map((m: any) => m.campaign_id).filter(Boolean))];
    if (campaignIds.length > 0) {
      const { data: campaigns, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name')
        .in('id', campaignIds);

      // Checked, but not fatal — a message with no campaign name is still worth
      // showing. Silently dropping the error would hide a broken join forever,
      // which is how this whole page came to display nothing.
      if (campaignError) {
        console.error('SMS analytics: campaign names unavailable:', campaignError);
      } else {
        const byId = new Map((campaigns ?? []).map((c: any) => [c.id, c.name]));
        for (const m of messages as any[]) {
          if (m.campaign_id && byId.has(m.campaign_id)) m.campaign = { name: byId.get(m.campaign_id) };
        }
      }
    }

    const stats = {
      totalSent: messages?.length || 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalPending: 0,
      totalCost: 0,
      deliveryRate: 0,
    };

    for (const msg of messages) {
      const status = (msg as any).status;
      if (status === 'delivered') stats.totalDelivered++;
      else if (status === 'failed' || status === 'undelivered') stats.totalFailed++;
      else stats.totalPending++;
      stats.totalCost += (msg as any).points_cost || 0;
    }

    if (stats.totalSent > 0) {
      stats.deliveryRate = (stats.totalDelivered / stats.totalSent) * 100;
    }

    return NextResponse.json({ success: true, messages, stats });
  } catch (error: any) {
    console.error('Error in SMS analytics API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

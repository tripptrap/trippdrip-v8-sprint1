import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters for filtering
    const searchParams = req.nextUrl.searchParams;
    const dateFilter = searchParams.get('dateFilter') || 'all'; // all, today, week, month
    const statusFilter = searchParams.get('statusFilter') || 'all'; // all, delivered, failed, pending

    // Build query
    let query = supabase
      .from('sms_messages')
      .select(`
        id,
        to_phone,
        from_phone,
        message_body,
        twilio_status,
        twilio_error_message,
        cost_points,
        sent_at,
        delivered_at,
        failed_at,
        lead_id,
        campaign_id,
        leads:lead_id (
          first_name,
          last_name
        ),
        campaigns:campaign_id (
          name
        )
      `)
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false });

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
        default:
          startDate = new Date(0); // Beginning of time
      }

      query = query.gte('sent_at', startDate.toISOString());
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'delivered') {
        query = query.or('twilio_status.eq.delivered,delivered_at.not.is.null');
      } else if (statusFilter === 'failed') {
        query = query.or('twilio_status.eq.failed,failed_at.not.is.null');
      } else if (statusFilter === 'pending') {
        query = query
          .is('delivered_at', null)
          .is('failed_at', null)
          .or('twilio_status.eq.queued,twilio_status.eq.sent,twilio_status.eq.sending,twilio_status.is.null');
      }
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching SMS messages:', messagesError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const stats = {
      totalSent: messages?.length || 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalPending: 0,
      totalCost: 0,
      deliveryRate: 0,
    };

    if (messages && messages.length > 0) {
      messages.forEach((msg: any) => {
        // Count delivered
        if (msg.delivered_at || msg.twilio_status === 'delivered') {
          stats.totalDelivered++;
        }
        // Count failed
        else if (msg.failed_at || msg.twilio_status === 'failed') {
          stats.totalFailed++;
        }
        // Count pending
        else {
          stats.totalPending++;
        }

        // Sum cost
        stats.totalCost += msg.cost_points || 0;
      });

      // Calculate delivery rate
      if (stats.totalSent > 0) {
        stats.deliveryRate = (stats.totalDelivered / stats.totalSent) * 100;
      }
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
      stats,
    });

  } catch (error: any) {
    console.error('Error in SMS analytics API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Message Performance Analytics
 * Tracks message engagement metrics, reply rates, and response times
 *
 * Metrics:
 * - Total messages sent/received
 * - Reply rate (% of leads that respond)
 * - Average response time
 * - Engagement by time of day
 * - Engagement by day of week
 * - Template performance
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
    const campaignId = searchParams.get('campaignId'); // Optional: filter by campaign

    // Get all threads for the user
    let threadsQuery = supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id);

    const { data: threads, error: threadsError } = await threadsQuery;

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      return NextResponse.json({ ok: false, error: threadsError.message }, { status: 500 });
    }

    if (!threads || threads.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          total_sent: 0,
          total_received: 0,
          overall_reply_rate: 0,
        }
      });
    }

    // Get all messages with date filtering
    let messagesQuery = supabase
      .from('messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (dateFrom) {
      messagesQuery = messagesQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      messagesQuery = messagesQuery.lte('created_at', dateTo);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    }

    // Calculate basic metrics
    const sentMessages = messages?.filter(m => m.direction === 'outbound') || [];
    const receivedMessages = messages?.filter(m => m.direction === 'inbound') || [];

    const totalSent = sentMessages.length;
    const totalReceived = receivedMessages.length;

    // Calculate reply rate (threads with at least one response)
    const threadsWithReplies = threads.filter(t => t.messages_from_lead > 0).length;
    const overallReplyRate = threads.length > 0 ? (threadsWithReplies / threads.length) * 100 : 0;

    // Calculate average response time
    const responseTimes: number[] = [];
    const messagesByThread = messages?.reduce((acc: any, msg) => {
      if (!acc[msg.thread_id]) acc[msg.thread_id] = [];
      acc[msg.thread_id].push(msg);
      return acc;
    }, {}) || {};

    Object.values(messagesByThread).forEach((threadMessages: any) => {
      // Sort by created_at
      threadMessages.sort((a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Find pairs of outbound → inbound messages
      for (let i = 0; i < threadMessages.length - 1; i++) {
        const current = threadMessages[i];
        const next = threadMessages[i + 1];

        if (current.direction === 'outbound' && next.direction === 'inbound') {
          const timeDiff = new Date(next.created_at).getTime() - new Date(current.created_at).getTime();
          responseTimes.push(timeDiff);
        }
      }
    });

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const avgResponseTimeMinutes = Math.round(avgResponseTime / 1000 / 60);
    const avgResponseTimeHours = (avgResponseTimeMinutes / 60).toFixed(1);

    // Engagement by hour of day
    const messagesByHour = new Array(24).fill(0).map((_, i) => ({
      hour: i,
      sent: 0,
      received: 0,
      reply_rate: 0,
    }));

    sentMessages.forEach(msg => {
      const hour = new Date(msg.created_at).getHours();
      messagesByHour[hour].sent++;
    });

    receivedMessages.forEach(msg => {
      const hour = new Date(msg.created_at).getHours();
      messagesByHour[hour].received++;
    });

    messagesByHour.forEach(hourData => {
      if (hourData.sent > 0) {
        hourData.reply_rate = (hourData.received / hourData.sent) * 100;
      }
    });

    // Engagement by day of week
    const messagesByDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => ({
      day,
      day_index: i,
      sent: 0,
      received: 0,
      reply_rate: 0,
    }));

    sentMessages.forEach(msg => {
      const day = new Date(msg.created_at).getDay();
      messagesByDay[day].sent++;
    });

    receivedMessages.forEach(msg => {
      const day = new Date(msg.created_at).getDay();
      messagesByDay[day].received++;
    });

    messagesByDay.forEach(dayData => {
      if (dayData.sent > 0) {
        dayData.reply_rate = (dayData.received / dayData.sent) * 100;
      }
    });

    // Best performing times
    const bestHour = messagesByHour.reduce((best, current) =>
      current.reply_rate > best.reply_rate ? current : best
    , messagesByHour[0]);

    const bestDay = messagesByDay.reduce((best, current) =>
      current.reply_rate > best.reply_rate ? current : best
    , messagesByDay[0]);

    // Message length analysis
    const sentMessageLengths = sentMessages.map(m => m.content?.length || 0);
    const avgMessageLength = sentMessageLengths.length > 0
      ? Math.round(sentMessageLengths.reduce((sum, len) => sum + len, 0) / sentMessageLengths.length)
      : 0;

    // Status-based success rates
    const { data: leads } = await supabase
      .from('leads')
      .select('id, status, disposition, created_at')
      .eq('user_id', user.id);

    const threadSuccessMap = threads.map(thread => {
      const lead = leads?.find(l => l.id === thread.lead_id);
      return {
        thread_id: thread.id,
        messages_sent: thread.messages_from_user,
        messages_received: thread.messages_from_lead,
        reply_rate: thread.messages_from_user > 0
          ? (thread.messages_from_lead / thread.messages_from_user) * 100
          : 0,
        disposition: lead?.disposition || 'none',
        status: lead?.status || 'unknown',
      };
    });

    // Group by disposition
    const dispositionStats = threadSuccessMap.reduce((acc: any, thread) => {
      const disp = thread.disposition;
      if (!acc[disp]) {
        acc[disp] = {
          count: 0,
          total_sent: 0,
          total_received: 0,
          avg_reply_rate: 0,
        };
      }
      acc[disp].count++;
      acc[disp].total_sent += thread.messages_sent;
      acc[disp].total_received += thread.messages_received;
      acc[disp].avg_reply_rate += thread.reply_rate;
      return acc;
    }, {});

    // Calculate averages
    Object.keys(dispositionStats).forEach(disp => {
      const stats = dispositionStats[disp];
      stats.avg_reply_rate = stats.count > 0 ? stats.avg_reply_rate / stats.count : 0;
    });

    // Time series data (messages per day)
    const messagesByDate = messages?.reduce((acc: any, msg) => {
      const date = new Date(msg.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { sent: 0, received: 0 };
      }
      if (msg.direction === 'outbound') acc[date].sent++;
      if (msg.direction === 'inbound') acc[date].received++;
      return acc;
    }, {}) || {};

    const timeSeriesData = Object.entries(messagesByDate)
      .map(([date, stats]: [string, any]) => ({
        date,
        sent: stats.sent,
        received: stats.received,
        reply_rate: stats.sent > 0 ? (stats.received / stats.sent) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      ok: true,
      metrics: {
        total_sent: totalSent,
        total_received: totalReceived,
        overall_reply_rate: overallReplyRate,
        threads_with_replies: threadsWithReplies,
        total_threads: threads.length,
        avg_response_time_minutes: avgResponseTimeMinutes,
        avg_response_time_hours: avgResponseTimeHours,
        avg_message_length: avgMessageLength,
      },
      engagement_patterns: {
        by_hour: messagesByHour,
        by_day: messagesByDay,
        best_hour: {
          hour: bestHour.hour,
          reply_rate: bestHour.reply_rate,
          time_label: `${bestHour.hour}:00 - ${bestHour.hour + 1}:00`,
        },
        best_day: {
          day: bestDay.day,
          reply_rate: bestDay.reply_rate,
        },
      },
      by_disposition: dispositionStats,
      time_series: timeSeriesData,
      date_range: {
        from: dateFrom || 'all',
        to: dateTo || 'now',
      },
    });

  } catch (error: any) {
    console.error('Error in message performance analytics:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to generate message performance metrics'
    }, { status: 500 });
  }
}

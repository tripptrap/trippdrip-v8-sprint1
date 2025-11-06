import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: "Unauthorized",
        totalLeads: 0,
        totalCampaigns: 0,
        totalMessages: 0,
        totalMessagesSent: 0,
        totalMessagesReceived: 0,
        responseRate: 0,
        conversionRate: 0,
        soldLeads: 0,
        avgResponseTime: 0,
        totalCreditsUsed: 0,
      }, { status: 401 });
    }

    // Get total leads count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get total campaigns count
    const { count: totalCampaigns } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get all threads for message statistics
    const { data: threads } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id);

    // Calculate message stats from threads
    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;
    let threadsWithResponses = 0;

    for (const thread of threads || []) {
      totalMessagesSent += thread.messages_from_user || 0;
      totalMessagesReceived += thread.messages_from_lead || 0;

      // Count threads where lead responded
      if (thread.messages_from_lead > 0) {
        threadsWithResponses++;
      }
    }

    const totalMessages = totalMessagesSent + totalMessagesReceived;

    // Response rate: % of threads where lead responded
    const responseRate = totalMessagesSent > 0
      ? parseFloat(((threadsWithResponses / (threads?.length || 1)) * 100).toFixed(1))
      : 0;

    // Get sold leads count
    const { count: soldLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('disposition', 'sold');

    // Conversion rate: % of leads marked as "sold"
    const conversionRate = totalLeads && totalLeads > 0
      ? parseFloat(((soldLeads || 0) / totalLeads * 100).toFixed(1))
      : 0;

    // Get user's credit usage
    const { data: userData } = await supabase
      .from('users')
      .select('credits, monthly_credits')
      .eq('id', user.id)
      .single();

    const totalCreditsUsed = (userData?.monthly_credits || 0) - (userData?.credits || 0);

    // Average response time calculation (from threads data)
    let avgResponseTimeHours = 0;
    if (threads && threads.length > 0) {
      let totalResponseTime = 0;
      let responseCount = 0;

      for (const thread of threads) {
        if (thread.last_message_at && thread.created_at && thread.messages_from_lead > 0) {
          const responseTime = new Date(thread.last_message_at).getTime() - new Date(thread.created_at).getTime();
          totalResponseTime += responseTime;
          responseCount++;
        }
      }

      if (responseCount > 0) {
        avgResponseTimeHours = parseFloat((totalResponseTime / responseCount / (1000 * 60 * 60)).toFixed(1));
      }
    }

    return NextResponse.json({
      totalLeads: totalLeads || 0,
      totalCampaigns: totalCampaigns || 0,
      totalMessages,
      totalMessagesSent,
      totalMessagesReceived,
      responseRate,
      conversionRate,
      soldLeads: soldLeads || 0,
      avgResponseTime: avgResponseTimeHours,
      totalCreditsUsed,
    });
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    return NextResponse.json({
      error: "Failed to fetch analytics",
      totalLeads: 0,
      totalCampaigns: 0,
      totalMessages: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      responseRate: 0,
      conversionRate: 0,
      soldLeads: 0,
      avgResponseTime: 0,
      totalCreditsUsed: 0,
    }, { status: 500 });
  }
}

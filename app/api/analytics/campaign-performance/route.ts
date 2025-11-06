import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", data: [] }, { status: 401 });
    }

    // Get all campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      return NextResponse.json({ error: campaignsError.message, data: [] }, { status: 500 });
    }

    // Get all leads and threads for calculations
    const { data: leads } = await supabase
      .from('leads')
      .select('id, tags, disposition')
      .eq('user_id', user.id);

    const { data: threads } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id);

    // Calculate performance for each campaign
    const performanceData = await Promise.all((campaigns || []).map(async campaign => {
      // Find leads that belong to this campaign (by matching tags or campaign name in tags)
      const campaignLeads = (leads || []).filter(lead => {
        const leadTags = Array.isArray(lead.tags) ? lead.tags : [];
        return leadTags.includes(campaign.name);
      });

      const campaignLeadIds = campaignLeads.map(l => l.id);

      // Find threads for these leads
      const campaignThreads = (threads || []).filter(t =>
        campaignLeadIds.includes(t.lead_id)
      );

      // Calculate metrics
      const totalLeads = campaignLeads.length;
      const messagesSent = campaignThreads.reduce((sum, t) => sum + (t.messages_from_user || 0), 0);
      const messagesReceived = campaignThreads.reduce((sum, t) => sum + (t.messages_from_lead || 0), 0);
      const threadsWithResponses = campaignThreads.filter(t => (t.messages_from_lead || 0) > 0).length;

      const responseRate = totalLeads > 0
        ? parseFloat(((threadsWithResponses / totalLeads) * 100).toFixed(1))
        : 0;

      // Calculate conversion rate (leads marked as "sold")
      const conversions = campaignLeads.filter(lead => lead.disposition === 'sold').length;
      const conversionRate = totalLeads > 0
        ? parseFloat(((conversions / totalLeads) * 100).toFixed(1))
        : 0;

      // Calculate average response time
      let avgResponseTime = 0;
      const responseTimes = campaignThreads
        .filter(t => t.last_message_at && t.created_at && (t.messages_from_lead || 0) > 0)
        .map(t => new Date(t.last_message_at).getTime() - new Date(t.created_at).getTime());

      if (responseTimes.length > 0) {
        const avgMs = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
        avgResponseTime = parseFloat((avgMs / (1000 * 60 * 60)).toFixed(1)); // Convert to hours
      }

      return {
        id: campaign.id,
        name: campaign.name,
        totalLeads,
        messagesSent,
        messagesReceived,
        responseRate,
        conversions,
        conversionRate,
        avgResponseTime,
        created_at: campaign.created_at,
      };
    }));

    // Sort by response rate descending
    performanceData.sort((a, b) => b.responseRate - a.responseRate);

    return NextResponse.json({ data: performanceData });
  } catch (error) {
    console.error("Error fetching campaign performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign performance", data: [] },
      { status: 500 }
    );
  }
}

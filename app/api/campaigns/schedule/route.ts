import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ScheduleCampaignRequest {
  name: string;
  message: string;
  leadIds: string[];
  schedule: {
    startDate: string; // ISO datetime
    percentage: number; // Percentage of leads to send per batch (1-100)
    intervalHours: number; // Hours between batches
    repeat: boolean; // Whether to auto-schedule next batch until all leads are sent
  };
  tags?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body: ScheduleCampaignRequest = await req.json();
    const { name, message, leadIds, schedule, tags } = body;

    if (!name || !message || !leadIds || leadIds.length === 0 || !schedule) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate schedule
    if (schedule.percentage < 1 || schedule.percentage > 100) {
      return NextResponse.json(
        { ok: false, error: "Percentage must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (schedule.intervalHours < 1) {
      return NextResponse.json(
        { ok: false, error: "Interval must be at least 1 hour" },
        { status: 400 }
      );
    }

    // Validate start date is in the future
    const startDate = new Date(schedule.startDate);
    if (startDate <= new Date()) {
      return NextResponse.json(
        { ok: false, error: "Start date must be in the future" },
        { status: 400 }
      );
    }

    // Create scheduled campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('scheduled_campaigns')
      .insert({
        user_id: user.id,
        name,
        message,
        lead_ids: leadIds,
        total_leads: leadIds.length,
        leads_sent: 0,
        percentage_per_batch: schedule.percentage,
        interval_hours: schedule.intervalHours,
        start_date: schedule.startDate,
        next_batch_date: schedule.startDate,
        auto_repeat: schedule.repeat,
        status: 'scheduled',
        tags: tags || [],
      })
      .select()
      .single();

    if (campaignError) {
      console.error("Error creating scheduled campaign:", campaignError);
      return NextResponse.json(
        { ok: false, error: "Failed to schedule campaign" },
        { status: 500 }
      );
    }

    // Calculate how many batches will be needed
    const leadsPerBatch = Math.ceil((leadIds.length * schedule.percentage) / 100);
    const totalBatches = Math.ceil(leadIds.length / leadsPerBatch);

    return NextResponse.json({
      ok: true,
      message: "Campaign scheduled successfully",
      campaign: {
        id: campaign.id,
        name: campaign.name,
        totalLeads: leadIds.length,
        leadsPerBatch,
        totalBatches,
        startDate: campaign.start_date,
        estimatedCompletionDate: new Date(
          startDate.getTime() + (totalBatches * schedule.intervalHours * 60 * 60 * 1000)
        ).toISOString(),
      },
    });
  } catch (error) {
    console.error("Error scheduling campaign:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to schedule campaign" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve scheduled campaigns
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get all scheduled campaigns for the user
    const { data: campaigns, error: fetchError } = await supabase
      .from('scheduled_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['scheduled', 'running', 'paused'])
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error("Error fetching scheduled campaigns:", fetchError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch scheduled campaigns" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      campaigns: campaigns || [],
    });
  } catch (error) {
    console.error("Error fetching scheduled campaigns:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch scheduled campaigns" },
      { status: 500 }
    );
  }
}

// PATCH endpoint to pause/resume/cancel a campaign
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('id');
    const action = searchParams.get('action'); // 'pause', 'resume', 'cancel'

    if (!campaignId || !action) {
      return NextResponse.json(
        { ok: false, error: "Campaign ID and action are required" },
        { status: 400 }
      );
    }

    let newStatus: string;
    switch (action) {
      case 'pause':
        newStatus = 'paused';
        break;
      case 'resume':
        newStatus = 'running';
        break;
      case 'cancel':
        newStatus = 'cancelled';
        break;
      default:
        return NextResponse.json(
          { ok: false, error: "Invalid action" },
          { status: 400 }
        );
    }

    // Update the campaign status
    const { error: updateError } = await supabase
      .from('scheduled_campaigns')
      .update({ status: newStatus })
      .eq('id', campaignId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error("Error updating campaign:", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Campaign ${action}d successfully`,
    });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

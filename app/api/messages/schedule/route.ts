import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateSMSCredits } from "@/lib/creditCalculator";

interface ScheduleMessageRequest {
  leadId: string;
  body: string;
  scheduledFor: string; // ISO datetime string
  channel: 'sms' | 'email';
  subject?: string; // For emails
  source?: 'manual' | 'drip' | 'campaign' | 'bulk'; // Where the message originated
  campaignId?: string; // Associated campaign if any
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

    const body: ScheduleMessageRequest = await req.json();
    const { leadId, body: messageBody, scheduledFor, channel, subject, source = 'manual', campaignId } = body;

    if (!leadId || !messageBody || !scheduledFor) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { ok: false, error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    // Calculate credits for SMS
    let creditsCost = 0;
    let segments = 0;
    if (channel === 'sms') {
      const creditCalc = calculateSMSCredits(messageBody, 0);
      creditsCost = creditCalc.credits;
      segments = creditCalc.segments;
    }

    // Create new scheduled message in Supabase
    const { data: scheduledMessage, error: insertError } = await supabase
      .from('scheduled_messages')
      .insert({
        user_id: user.id,
        lead_id: leadId,
        channel,
        subject: channel === 'email' ? subject : null,
        body: messageBody,
        status: 'pending',
        scheduled_for: scheduledFor,
        credits_cost: creditsCost,
        segments,
        source: source,
        campaign_id: campaignId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting scheduled message:", insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to schedule message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Message scheduled successfully",
      messageId: scheduledMessage.id,
      scheduledFor: scheduledMessage.scheduled_for,
    });
  } catch (error) {
    console.error("Error scheduling message:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to schedule message" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve scheduled messages
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

    // Parse query params
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source'); // Filter by source: manual, drip, campaign, bulk
    const includeAll = searchParams.get('includeAll') === 'true'; // Include sent/cancelled

    // Build query
    let query = supabase
      .from('scheduled_messages')
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          phone,
          email
        )
      `)
      .eq('user_id', user.id);

    // Filter by status
    if (!includeAll) {
      query = query.in('status', ['pending', 'failed']);
    }

    // Filter by source if provided
    if (source && source !== 'all') {
      query = query.eq('source', source);
    }

    // Order by scheduled time
    query = query.order('scheduled_for', { ascending: true });

    const { data: scheduledMessages, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching scheduled messages:", fetchError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch scheduled messages" },
        { status: 500 }
      );
    }

    // Count by source for tabs
    const { data: sourceCounts } = await supabase
      .from('scheduled_messages')
      .select('source')
      .eq('user_id', user.id)
      .in('status', ['pending', 'failed']);

    const counts = {
      all: sourceCounts?.length || 0,
      manual: sourceCounts?.filter(m => m.source === 'manual' || !m.source).length || 0,
      drip: sourceCounts?.filter(m => m.source === 'drip').length || 0,
      campaign: sourceCounts?.filter(m => m.source === 'campaign').length || 0,
      bulk: sourceCounts?.filter(m => m.source === 'bulk').length || 0,
    };

    return NextResponse.json({
      ok: true,
      scheduledMessages: scheduledMessages || [],
      counts,
    });
  } catch (error) {
    console.error("Error fetching scheduled messages:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch scheduled messages" },
      { status: 500 }
    );
  }
}

// DELETE endpoint to cancel a scheduled message
export async function DELETE(req: NextRequest) {
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
    const messageId = searchParams.get('id');

    if (!messageId) {
      return NextResponse.json(
        { ok: false, error: "Message ID is required" },
        { status: 400 }
      );
    }

    // Update the status to cancelled
    const { error: updateError } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error("Error cancelling scheduled message:", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to cancel scheduled message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Scheduled message cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling scheduled message:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to cancel scheduled message" },
      { status: 500 }
    );
  }
}

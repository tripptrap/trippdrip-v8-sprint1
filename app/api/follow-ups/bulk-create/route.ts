import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BulkFollowUpRequest {
  leadIds: string[];
  title: string;
  notes?: string;
  due_date: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body: BulkFollowUpRequest = await req.json();
    const { leadIds, title, notes, due_date, priority } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No lead IDs provided" },
        { status: 400 }
      );
    }

    if (!title || !due_date) {
      return NextResponse.json(
        { ok: false, error: "Title and due date are required" },
        { status: 400 }
      );
    }

    // Get lead names for personalized titles
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, first_name, last_name')
      .in('id', leadIds)
      .eq('user_id', user.id);

    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      return NextResponse.json({ ok: false, error: leadsError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: false, error: 'No leads found' }, { status: 404 });
    }

    // Create follow-ups for each lead
    const followUps = leads.map(lead => ({
      user_id: user.id,
      lead_id: lead.id,
      title: title.replace('{name}', lead.first_name || 'Lead'),
      notes: notes || null,
      due_date,
      priority: priority || 'medium',
      reminder_type: 'manual',
      status: 'pending',
    }));

    const { data, error: insertError } = await supabase
      .from('follow_ups')
      .insert(followUps)
      .select();

    if (insertError) {
      console.error('Error creating follow-ups:', insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      createdCount: followUps.length,
      message: `Successfully created ${followUps.length} follow-up(s)`,
      data,
    });
  } catch (error: any) {
    console.error("Error in bulk follow-up creation:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to create follow-ups" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });
    }

    // Fetch the lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
    }

    // Check if already converted
    if (lead.client_id) {
      return NextResponse.json({ ok: false, error: "Lead already converted to client" }, { status: 409 });
    }

    // Create client record from lead data
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
        original_lead_id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
        email: lead.email,
        state: lead.state,
        zip_code: lead.zip_code,
        tags: lead.tags || [],
        campaign_id: lead.campaign_id,
        source: lead.source,
        notes: lead.notes,
        custom_fields: lead.custom_fields || {},
        flow_id: lead.flow_id,
        flow_name: lead.flow_name,
        qualification_score: lead.qualification_score,
        converted_from_lead_at: new Date().toISOString(),
        sold_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (clientError) {
      console.error("Error creating client:", clientError);
      return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
    }

    // Update lead with client reference and sold status
    await supabase
      .from("leads")
      .update({
        client_id: client.id,
        disposition: "sold",
        status: "sold",
        converted: true,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      clientId: client.id,
      message: "Lead converted to client successfully",
    });
  } catch (error: any) {
    console.error("Error converting lead to client:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

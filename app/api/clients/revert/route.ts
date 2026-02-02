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

    const { clientId } = await req.json();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    }

    // Fetch the client
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    // Restore original lead if it exists
    if (client.original_lead_id) {
      await supabase
        .from("leads")
        .update({
          client_id: null,
          disposition: null,
          status: "active",
          converted: false,
          converted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.original_lead_id)
        .eq("user_id", user.id);
    }

    // Delete client record
    const { error: deleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting client:", deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      leadId: client.original_lead_id,
      message: "Client reverted to lead successfully",
    });
  } catch (error: any) {
    console.error("Error reverting client to lead:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

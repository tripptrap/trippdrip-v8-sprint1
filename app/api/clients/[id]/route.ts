import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }

    return NextResponse.json({ ok: true, client });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const updateData: any = {};

    if (body.first_name !== undefined) updateData.first_name = body.first_name;
    if (body.last_name !== undefined) updateData.last_name = body.last_name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.state !== undefined) updateData.state = body.state;
    if (body.zip_code !== undefined) updateData.zip_code = body.zip_code;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.campaign_id !== undefined) updateData.campaign_id = body.campaign_id;

    const { data: client, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating client:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, client });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Get client to find original lead
    const { data: client } = await supabase
      .from("clients")
      .select("original_lead_id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    // Clear client_id on original lead if it exists
    if (client?.original_lead_id) {
      await supabase
        .from("leads")
        .update({ client_id: null })
        .eq("id", client.original_lead_id)
        .eq("user_id", user.id);
    }

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Client deleted" });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

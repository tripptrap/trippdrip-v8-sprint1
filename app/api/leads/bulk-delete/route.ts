import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No lead IDs provided" },
        { status: 400 }
      );
    }

    // Delete the leads
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting leads:', deleteError);
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedCount: leadIds.length,
      message: `Successfully deleted ${leadIds.length} lead(s)`,
    });
  } catch (error: any) {
    console.error("Error in bulk delete:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to delete leads" },
      { status: 500 }
    );
  }
}

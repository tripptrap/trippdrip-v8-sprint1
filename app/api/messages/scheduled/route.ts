import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Fetch all scheduled messages for the current user
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, items: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch scheduled messages from Supabase
    const { data: messages, error } = await supabase
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
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (error) {
      console.error('Error fetching scheduled messages:', error);
      return NextResponse.json({ ok: false, items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: messages || [] });
  } catch (error) {
    console.error("Error fetching scheduled messages:", error);
    return NextResponse.json(
      { ok: false, items: [], error: "Failed to fetch scheduled messages" },
      { status: 500 }
    );
  }
}

// DELETE: Cancel a scheduled message
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('id');

    if (!messageId) {
      return NextResponse.json(
        { ok: false, error: "Message ID required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Get the message to check status and ownership
    const { data: message, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', messageId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !message) {
      return NextResponse.json(
        { ok: false, error: "Message not found or access denied" },
        { status: 404 }
      );
    }

    // Check if it's scheduled (can only cancel pending messages)
    if (message.status !== 'pending') {
      return NextResponse.json(
        { ok: false, error: "Can only cancel pending messages" },
        { status: 400 }
      );
    }

    // Update status to cancelled
    const { error: updateError } = await supabase
      .from('scheduled_messages')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error cancelling message:', updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
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

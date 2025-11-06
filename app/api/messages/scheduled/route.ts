import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// GET: Fetch all scheduled messages
export async function GET(req: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const messagesPath = path.join(dataDir, "messages.json");

    let messages: any[] = [];
    try {
      const messagesData = await fs.readFile(messagesPath, "utf-8");
      messages = JSON.parse(messagesData);
    } catch {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Filter only scheduled messages
    const scheduledMessages = messages.filter(msg => msg.status === 'scheduled');

    // Sort by scheduled_for (soonest first)
    scheduledMessages.sort((a, b) =>
      new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
    );

    return NextResponse.json({ ok: true, items: scheduledMessages });
  } catch (error) {
    console.error("Error fetching scheduled messages:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch scheduled messages" },
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

    const dataDir = path.join(process.cwd(), "data");
    const messagesPath = path.join(dataDir, "messages.json");

    let messages: any[] = [];
    try {
      const messagesData = await fs.readFile(messagesPath, "utf-8");
      messages = JSON.parse(messagesData);
    } catch {
      return NextResponse.json(
        { ok: false, error: "No messages found" },
        { status: 404 }
      );
    }

    // Find the message
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "Message not found" },
        { status: 404 }
      );
    }

    // Check if it's scheduled
    if (messages[messageIndex].status !== 'scheduled') {
      return NextResponse.json(
        { ok: false, error: "Can only cancel scheduled messages" },
        { status: 400 }
      );
    }

    // Update status to cancelled
    messages[messageIndex].status = 'cancelled';
    messages[messageIndex].updated_at = new Date().toISOString();

    // Save
    await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), "utf-8");

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

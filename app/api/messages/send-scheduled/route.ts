import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

/**
 * Cron job endpoint to send scheduled messages
 * Should be called every 5 minutes via Vercel Cron or external cron service
 *
 * In production, add this to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/messages/send-scheduled",
 *     "schedule": "*\/5 * * * *"
 *   }]
 * }
 */

export async function GET(req: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const messagesPath = path.join(dataDir, "messages.json");

    // Read messages
    let messages: any[] = [];
    try {
      const messagesData = await fs.readFile(messagesPath, "utf-8");
      messages = JSON.parse(messagesData);
    } catch {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No messages file found",
      });
    }

    const now = new Date();
    let sentCount = 0;
    let failedCount = 0;

    // Find messages that should be sent now
    const messagesToSend = messages.filter(msg =>
      msg.status === 'scheduled' &&
      msg.scheduled_for &&
      new Date(msg.scheduled_for) <= now
    );

    if (messagesToSend.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No messages ready to send",
      });
    }

    // Update messages array
    messages = messages.map(msg => {
      const shouldSend = messagesToSend.find(m => m.id === msg.id);
      if (!shouldSend) return msg;

      // In production, this would actually send via Twilio/Email API
      // For now, just mark as sent
      try {
        // TODO: Add actual Twilio/Email sending logic here
        // const twilioResult = await sendViaTwilio(msg);

        sentCount++;
        return {
          ...msg,
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } catch (error) {
        failedCount++;
        return {
          ...msg,
          status: 'failed',
          error: `Failed to send: ${error}`,
          updated_at: new Date().toISOString(),
        };
      }
    });

    // Save updated messages
    await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      processed: messagesToSend.length,
      sent: sentCount,
      failed: failedCount,
      message: `Processed ${messagesToSend.length} scheduled messages`,
    });
  } catch (error) {
    console.error("Error sending scheduled messages:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process scheduled messages" },
      { status: 500 }
    );
  }
}

// POST endpoint for manual testing
export async function POST(req: NextRequest) {
  return GET(req);
}

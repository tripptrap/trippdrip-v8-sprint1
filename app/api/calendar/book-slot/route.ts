import { NextRequest, NextResponse } from "next/server";
import { getCalendarClient } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { start, end, name, phone, email } = await req.json();

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;

    if (!calendarId) {
      return NextResponse.json({ error: "Calendar not configured" }, { status: 500 });
    }

    // re-check to avoid double booking
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: "startTime",
    });

    if ((data.items || []).length > 0) {
      return NextResponse.json({ error: "Time slot already booked" }, { status: 409 });
    }

    const event = {
      summary: `Call with ${name || "Prospect"}`,
      description: phone ? `Phone: ${phone}` : "",
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: email ? [{ email }] : [],
    };

    const created = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    console.log(`✅ Booked appointment: ${created.data.id}`);
    return NextResponse.json({ ok: true, eventId: created.data.id });
  } catch (err: any) {
    console.error("book-slot error", err);
    return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
  }
}

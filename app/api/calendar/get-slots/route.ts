import { NextRequest, NextResponse } from "next/server";
import { getCalendarClient } from "@/lib/googleCalendar";
import { DateTime } from "luxon";

const SLOT_DURATION_MIN = 30; // 30-minute slots

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const tz = process.env.TIMEZONE || "America/New_York";

    if (!calendarId) {
      return NextResponse.json({ error: "Calendar not configured" }, { status: 500 });
    }

    // start with "today"
    let day = DateTime.now().setZone(tz).startOf("day");
    let slots: any[] = [];

    // we'll look up to 14 days ahead
    for (let i = 0; i < 14 && slots.length < 3; i++) {
      const dayStart = day.plus({ days: i }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
      const dayEnd = day.plus({ days: i }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

      // get events for that day
      const eventsRes = await calendar.events.list({
        calendarId,
        timeMin: dayStart.toISO() as string,
        timeMax: dayEnd.toISO() as string,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = eventsRes.data.items || [];

      // build busy blocks
      const busy: Array<{ start: DateTime; end: DateTime }> = events
        .filter(e => e.start?.dateTime && e.end?.dateTime)
        .map(e => ({
          start: DateTime.fromISO(e.start!.dateTime!).setZone(tz),
          end: DateTime.fromISO(e.end!.dateTime!).setZone(tz),
        }));

      // walk through the day in 30-min chunks
      let slotTime = dayStart;
      while (slotTime < dayEnd && slots.length < 3) {
        const slotEnd = slotTime.plus({ minutes: SLOT_DURATION_MIN });

        const overlaps = busy.some(b => {
          return slotTime < b.end && slotEnd > b.start;
        });

        if (!overlaps && slotTime > DateTime.now().setZone(tz)) {
          slots.push({
            start: slotTime.toISO(),
            end: slotEnd.toISO(),
            display: slotTime.toFormat("h:mm a"),
            day: slotTime.toFormat("ccc, MMM d"),
            formatted: `${slotTime.toFormat("ccc, MMM d")} at ${slotTime.toFormat("h:mm a")}`,
          });
        }

        slotTime = slotTime.plus({ minutes: SLOT_DURATION_MIN });
      }
    }

    console.log(`📅 Found ${slots.length} available slots`);
    return NextResponse.json({ slots });
  } catch (err: any) {
    console.error("get-slots error", err);
    return NextResponse.json({ error: "Failed to get slots" }, { status: 500 });
  }
}

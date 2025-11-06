import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { format, getDay } from "date-fns";

interface Message {
  id: string;
  direction: string;
  created_at?: string;
}

export async function GET(req: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const messagesData = await fs.readFile(path.join(dataDir, "messages.json"), "utf-8");
    const messages: Message[] = JSON.parse(messagesData);

    // Initialize heatmap structure
    const heatmap: { [hour: string]: { [day: string]: number } } = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Initialize all hours and days with 0
    for (let hour = 0; hour < 24; hour++) {
      heatmap[hour.toString()] = {};
      dayNames.forEach(day => {
        heatmap[hour.toString()][day] = 0;
      });
    }

    // Count received messages by hour and day (only count lead responses)
    messages
      .filter(msg => msg.direction === 'in' && msg.created_at)
      .forEach(msg => {
        const date = new Date(msg.created_at!);
        const hour = date.getHours().toString();
        const dayIndex = getDay(date);
        const dayName = dayNames[dayIndex];

        heatmap[hour][dayName]++;
      });

    return NextResponse.json({ heatmap });
  } catch (error) {
    console.error("Error fetching best times:", error);
    return NextResponse.json(
      { error: "Failed to fetch best times" },
      { status: 500 }
    );
  }
}

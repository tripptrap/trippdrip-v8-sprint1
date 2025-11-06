import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDay } from "date-fns";

interface Message {
  id: string;
  direction: string;
  created_at?: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch messages for current user
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, direction, created_at')
      .eq('user_id', user.id);

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch best times" },
        { status: 500 }
      );
    }

    const messagesData = messages || [];

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
    messagesData
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

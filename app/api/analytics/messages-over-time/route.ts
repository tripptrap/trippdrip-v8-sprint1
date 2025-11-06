import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format, subDays, startOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", data: [] }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');

    // Create date map for the last N days
    const dateMap: { [key: string]: { sent: number; received: number } } = {};
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      dateMap[dateStr] = { sent: 0, received: 0 };
    }

    // Get all threads with their message counts
    // Since we don't have individual message timestamps, we'll use thread creation and update times
    const { data: threads } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (threads) {
      // For each thread, distribute messages across dates
      // This is a simplified approach - ideally we'd have a messages table with timestamps
      for (const thread of threads) {
        const createdDate = format(new Date(thread.created_at), 'yyyy-MM-dd');
        const lastMessageDate = thread.last_message_at
          ? format(new Date(thread.last_message_at), 'yyyy-MM-dd')
          : createdDate;

        // Add sent messages to creation date
        if (dateMap[createdDate] && thread.messages_from_user) {
          dateMap[createdDate].sent += thread.messages_from_user;
        }

        // Add received messages to last message date
        if (dateMap[lastMessageDate] && thread.messages_from_lead) {
          dateMap[lastMessageDate].received += thread.messages_from_lead;
        }
      }
    }

    // Convert to array and sort by date
    const data = Object.keys(dateMap)
      .sort()
      .map(date => ({
        date,
        sent: dateMap[date].sent,
        received: dateMap[date].received,
      }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching messages over time:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages over time", data: [] },
      { status: 500 }
    );
  }
}

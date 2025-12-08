import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const url = new URL(req.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Phone number required' }, { status: 400 });
    }

    // Normalize phone number (remove non-digits)
    const normalizedPhone = phone.replace(/\D/g, '');

    // First, find threads with this phone number
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select('id')
      .eq('user_id', user.id)
      .or(`lead_phone.eq.${phone},lead_phone.eq.${normalizedPhone},lead_phone.eq.+1${normalizedPhone},lead_phone.eq.+${normalizedPhone}`);

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      return NextResponse.json({ ok: false, error: threadsError.message }, { status: 500 });
    }

    if (!threads || threads.length === 0) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const threadIds = threads.map(t => t.id);

    // Fetch messages for these threads
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', user.id)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, messages: messages || [] });
  } catch (error: any) {
    console.error('Error in GET /api/messages/by-phone:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

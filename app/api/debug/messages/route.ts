// DEBUG: Check messages in database
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all threads for this user
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10);

    // Get all messages (limited)
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // If phone provided, search specifically
    let messagesByPhone = null;
    if (phone) {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`sender.ilike.%${phone}%,recipient.ilike.%${phone}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      messagesByPhone = data;
    }

    return NextResponse.json({
      user_id: user.id,
      threads: {
        count: threads?.length || 0,
        data: threads,
        error: threadsError?.message,
      },
      messages: {
        count: messages?.length || 0,
        sample: messages?.slice(0, 5),
        error: messagesError?.message,
      },
      messagesByPhone: messagesByPhone,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

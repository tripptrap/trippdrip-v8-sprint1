// API Route: Get messages for a specific thread
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId } = params;

    // Verify thread belongs to user
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .select('user_id')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    if (thread.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Fetch messages for this thread
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    console.log('📨 Fetching messages for thread:', threadId);
    console.log('📨 Found messages:', messages?.length || 0);

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // If no messages found with thread_id, try to find by phone number from thread
    if (!messages || messages.length === 0) {
      // Get thread details to find phone number
      const { data: threadDetails } = await supabase
        .from('threads')
        .select('phone_number, lead_id')
        .eq('id', threadId)
        .single();

      console.log('📨 Thread details:', threadDetails);

      if (threadDetails?.phone_number) {
        // Try to find messages by from_phone/to_phone
        const { data: messagesByPhone } = await supabase
          .from('messages')
          .select('*')
          .eq('user_id', user.id)
          .or(`from_phone.eq.${threadDetails.phone_number},to_phone.eq.${threadDetails.phone_number}`)
          .order('created_at', { ascending: true });

        console.log('📨 Found messages by phone:', messagesByPhone?.length || 0);

        if (messagesByPhone && messagesByPhone.length > 0) {
          // Update these messages to have the correct thread_id for future queries
          const messageIds = messagesByPhone.map(m => m.id);
          await supabase
            .from('messages')
            .update({ thread_id: threadId })
            .in('id', messageIds);

          const normalizedMessages = messagesByPhone.map((msg: any) => ({
            ...msg,
            thread_id: threadId,
            body: msg.body || msg.content || '',
            sender: msg.from_phone || msg.sender || '',
            recipient: msg.to_phone || msg.recipient || '',
          }));

          return NextResponse.json({
            success: true,
            messages: normalizedMessages,
          });
        }
      }
    }

    // Normalize messages to consistent format for UI
    const normalizedMessages = (messages || []).map((msg: any) => ({
      ...msg,
      body: msg.body || msg.content || '',
      sender: msg.from_phone || msg.sender || '',
      recipient: msg.to_phone || msg.recipient || '',
    }));

    return NextResponse.json({
      success: true,
      messages: normalizedMessages,
    });
  } catch (error: any) {
    console.error('Error in messages API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

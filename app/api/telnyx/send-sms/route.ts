// API Route: Send SMS via Telnyx
// This sends outbound SMS messages through the Telnyx API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    const { to, from, message, userId, threadId, mediaUrls } = await req.json();

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Telnyx API key not configured' },
        { status: 500 }
      );
    }

    if (!messagingProfileId) {
      return NextResponse.json(
        { error: 'Telnyx messaging profile ID not configured' },
        { status: 500 }
      );
    }

    // Build request body
    const requestBody: any = {
      from: from || undefined, // If not provided, Telnyx will use number pool
      to: to,
      text: message,
      messaging_profile_id: messagingProfileId,
    };

    // Add media for MMS
    if (mediaUrls && mediaUrls.length > 0) {
      requestBody.media_urls = mediaUrls;
    }

    // Send via Telnyx API
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx API error:', data);
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || 'Failed to send message' },
        { status: response.status }
      );
    }

    console.log('✅ Telnyx SMS sent:', {
      to,
      from: data.data?.from?.phone_number,
      messageSid: data.data?.id,
    });

    // Save to database if we have user context
    if (supabaseAdmin && userId) {
      let finalThreadId = threadId;

      // Create or get thread
      if (!finalThreadId) {
        const { data: existingThread } = await supabaseAdmin
          .from('threads')
          .select('id, messages_from_user')
          .eq('user_id', userId)
          .eq('phone_number', to)
          .eq('channel', 'sms')
          .single();

        if (existingThread) {
          finalThreadId = existingThread.id;
          await supabaseAdmin
            .from('threads')
            .update({
              last_message: message,
              updated_at: new Date().toISOString(),
              messages_from_user: (existingThread.messages_from_user || 0) + 1,
            })
            .eq('id', finalThreadId);
        } else {
          const { data: newThread } = await supabaseAdmin
            .from('threads')
            .insert({
              user_id: userId,
              phone_number: to,
              channel: 'sms',
              status: 'active',
              last_message: message,
              messages_from_lead: 0,
              messages_from_user: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          finalThreadId = newThread?.id;
        }
      }

      // Save the message
      if (finalThreadId) {
        await supabaseAdmin.from('messages').insert({
          thread_id: finalThreadId,
          sender: data.data?.from?.phone_number || from,
          recipient: to,
          body: message,
          direction: 'outbound',
          status: 'sent',
          message_sid: data.data?.id,
          num_media: mediaUrls?.length || 0,
          media_urls: mediaUrls?.length > 0 ? mediaUrls : null,
          channel: mediaUrls?.length > 0 ? 'mms' : 'sms',
          provider: 'telnyx',
          created_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      messageId: data.data?.id,
      from: data.data?.from?.phone_number,
      to: data.data?.to?.[0]?.phone_number,
      status: data.data?.to?.[0]?.status,
    });

  } catch (error: any) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}

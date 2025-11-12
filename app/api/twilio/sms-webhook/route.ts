// API Route: Twilio SMS Webhook
// This receives incoming SMS messages from Twilio

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    // Extract Twilio webhook parameters
    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');
    const messageSid = params.get('MessageSid');
    const accountSid = params.get('AccountSid');
    const numMedia = parseInt(params.get('NumMedia') || '0');

    console.log('📨 Incoming SMS:', {
      from,
      to,
      body: messageBody,
      messageSid,
      accountSid,
      numMedia
    });

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find which user owns this phone number
    const { data: numberData, error: numberError } = await supabaseAdmin
      .from('user_twilio_numbers')
      .select('user_id, phone_number')
      .eq('phone_number', to)
      .eq('status', 'active')
      .single();

    if (numberError || !numberData) {
      console.error('Phone number not found in database:', to);
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const userId = numberData.user_id;

    // Find or create thread for this conversation
    let threadId: string;

    const { data: existingThread } = await supabaseAdmin
      .from('threads')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', from)
      .eq('channel', 'sms')
      .single();

    if (existingThread) {
      threadId = existingThread.id;

      // Update thread
      await supabaseAdmin
        .from('threads')
        .update({
          last_message: messageBody,
          updated_at: new Date().toISOString(),
        })
        .eq('id', threadId);
    } else {
      // Create new thread
      const { data: newThread, error: threadError } = await supabaseAdmin
        .from('threads')
        .insert({
          user_id: userId,
          phone_number: from,
          channel: 'sms',
          status: 'active',
          last_message: messageBody,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (threadError || !newThread) {
        console.error('Error creating thread:', threadError);
        return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' }
        });
      }

      threadId = newThread.id;
    }

    // Save the message
    const { error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        thread_id: threadId,
        sender: from,
        recipient: to,
        body: messageBody,
        direction: 'inbound',
        status: 'received',
        message_sid: messageSid,
        num_media: numMedia,
        channel: 'sms',
        created_at: new Date().toISOString(),
      });

    if (messageError) {
      console.error('Error saving message:', messageError);
    } else {
      console.log('✅ Message saved successfully');
    }

    // Return empty TwiML response (no auto-reply)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'text/xml' }
      }
    );

  } catch (error: any) {
    console.error('Webhook error:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'text/xml' }
      }
    );
  }
}

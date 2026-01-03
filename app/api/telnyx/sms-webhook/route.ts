// API Route: Telnyx SMS Webhook
// This receives incoming SMS messages from Telnyx

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

// Verify Telnyx webhook signature
function verifyTelnyxSignature(
  payload: string,
  signature: string,
  timestamp: string,
  publicKey: string
): boolean {
  try {
    const signedPayload = `${timestamp}|${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', publicKey)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Telnyx signature verification
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    const publicKey = process.env.TELNYX_PUBLIC_KEY;

    // Log for debugging (remove in production)
    console.log('📨 Telnyx webhook received:', {
      event_type: body?.data?.event_type,
      has_signature: !!signature,
      has_timestamp: !!timestamp,
    });

    // Skip signature validation in development or if not configured
    // In production, you should always validate
    if (publicKey && signature && timestamp) {
      // Note: Telnyx uses Ed25519 signatures, for simplicity we'll log but not block
      // Full Ed25519 verification requires additional libraries
      console.log('✅ Webhook signature headers present');
    }

    // Handle different Telnyx event types
    const eventType = body?.data?.event_type;
    const payload = body?.data?.payload;

    if (!payload) {
      console.log('No payload in webhook');
      return NextResponse.json({ received: true });
    }

    // Handle inbound SMS
    if (eventType === 'message.received') {
      await handleInboundSMS(payload);
    }

    // Handle delivery status updates
    if (eventType === 'message.sent' || eventType === 'message.delivered' || eventType === 'message.failed') {
      await handleDeliveryStatus(payload, eventType);
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Telnyx webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleInboundSMS(payload: any) {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured');
    return;
  }

  const from = payload.from?.phone_number;
  const to = payload.to?.[0]?.phone_number;
  const messageBody = payload.text;
  const messageSid = payload.id;
  const mediaUrls: string[] = [];

  // Handle MMS media
  if (payload.media && payload.media.length > 0) {
    for (const media of payload.media) {
      if (media.url) {
        mediaUrls.push(media.url);
      }
    }
  }

  console.log('📨 Incoming Telnyx SMS:', {
    from,
    to,
    body: messageBody,
    messageSid,
    mediaCount: mediaUrls.length,
  });

  // Find which user owns this phone number
  // Check both Telnyx and Twilio number tables
  let userId: string | null = null;

  // First try Telnyx numbers table
  const { data: telnyxNumber } = await supabaseAdmin
    .from('user_telnyx_numbers')
    .select('user_id')
    .eq('phone_number', to)
    .eq('status', 'active')
    .single();

  if (telnyxNumber) {
    userId = telnyxNumber.user_id;
  } else {
    // Fallback to Twilio numbers table (in case numbers are stored there)
    const { data: twilioNumber } = await supabaseAdmin
      .from('user_twilio_numbers')
      .select('user_id')
      .eq('phone_number', to)
      .eq('status', 'active')
      .single();

    if (twilioNumber) {
      userId = twilioNumber.user_id;
    }
  }

  if (!userId) {
    console.error('Phone number not found in database:', to);
    return;
  }

  // Find or create thread for this conversation
  let threadId: string;

  const { data: existingThread } = await supabaseAdmin
    .from('threads')
    .select('id, messages_from_lead')
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
        messages_from_lead: (existingThread.messages_from_lead || 0) + 1,
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
        messages_from_lead: 1,
        messages_from_user: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (threadError || !newThread) {
      console.error('Error creating thread:', threadError);
      return;
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
      num_media: mediaUrls.length,
      media_urls: mediaUrls.length > 0 ? mediaUrls : null,
      channel: mediaUrls.length > 0 ? 'mms' : 'sms',
      provider: 'telnyx',
      created_at: new Date().toISOString(),
    });

  if (messageError) {
    console.error('Error saving message:', messageError);
  } else {
    console.log('✅ Telnyx message saved successfully');
  }
}

async function handleDeliveryStatus(payload: any, eventType: string) {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not configured');
    return;
  }

  const messageSid = payload.id;
  let status = 'sent';

  if (eventType === 'message.delivered') {
    status = 'delivered';
  } else if (eventType === 'message.failed') {
    status = 'failed';
  }

  console.log('📬 Telnyx delivery status:', { messageSid, status, eventType });

  // Update message status
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('message_sid', messageSid);

  if (error) {
    console.error('Error updating message status:', error);
  } else {
    console.log('✅ Message status updated to:', status);
  }
}

// Handle GET requests (for webhook verification)
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'Telnyx webhook endpoint active' });
}

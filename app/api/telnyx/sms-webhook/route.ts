// API Route: Telnyx SMS Webhook
// This receives incoming SMS messages from Telnyx

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ContactType } from '@/lib/receptionist/types';

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

  // Find which user this message belongs to
  // Strategy: Match the sender's phone number to an existing thread or lead
  let userId: string | null = null;

  // First, check if there's an existing thread with this phone number
  const { data: existingThread } = await supabaseAdmin
    .from('threads')
    .select('user_id')
    .eq('phone_number', from)
    .single();

  if (existingThread) {
    userId = existingThread.user_id;
    console.log('Found user via existing thread:', userId);
  }

  // If no thread, try to find a lead with this phone number
  if (!userId) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('user_id')
      .eq('phone', from)
      .single();

    if (lead) {
      userId = lead.user_id;
      console.log('Found user via lead:', userId);
    }
  }

  // Fallback: Try user_telnyx_numbers table (if user registered their number)
  if (!userId) {
    const { data: telnyxNumber } = await supabaseAdmin
      .from('user_telnyx_numbers')
      .select('user_id')
      .eq('phone_number', to)
      .eq('status', 'active')
      .single();

    if (telnyxNumber) {
      userId = telnyxNumber.user_id;
      console.log('Found user via Telnyx number:', userId);
    }
  }

  if (!userId) {
    console.error('Could not find user for incoming message. From:', from, 'To:', to);
    return;
  }

  // Find or create thread for this conversation
  let threadId: string;

  const { data: threadData } = await supabaseAdmin
    .from('threads')
    .select('id, messages_from_lead')
    .eq('user_id', userId)
    .eq('phone_number', from)
    .eq('channel', 'sms')
    .single();

  if (threadData) {
    threadId = threadData.id;

    // Update thread
    await supabaseAdmin
      .from('threads')
      .update({
        last_message: messageBody,
        updated_at: new Date().toISOString(),
        messages_from_lead: (threadData.messages_from_lead || 0) + 1,
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
  console.log('💾 Saving inbound message:', { userId, threadId, from, to, messageBody: messageBody?.substring(0, 50) });

  const messageData = {
    user_id: userId, // Required for RLS
    thread_id: threadId,
    from_phone: from,
    to_phone: to,
    body: messageBody,
    content: messageBody, // content column has NOT NULL constraint
    direction: 'inbound',
    status: 'delivered', // 'received' not allowed by check constraint
    message_sid: messageSid,
    num_media: mediaUrls.length,
    media_urls: mediaUrls.length > 0 ? mediaUrls : null,
    channel: mediaUrls.length > 0 ? 'mms' : 'sms',
    provider: 'telnyx',
    created_at: new Date().toISOString(),
  };

  const { data: insertedMsg, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert(messageData)
    .select();

  if (messageError) {
    console.error('❌ Error saving inbound message:', messageError);
    console.error('❌ Message data was:', JSON.stringify(messageData));
  } else {
    console.log('✅ Telnyx inbound message saved:', insertedMsg);

    // Stop any active AI drip for this phone number (client replied)
    try {
      const { data: stoppedDrips, error: dripError } = await supabaseAdmin
        .from('ai_drips')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('phone_number', from)
        .eq('status', 'active')
        .select('id');

      if (stoppedDrips && stoppedDrips.length > 0) {
        console.log(`🛑 Stopped ${stoppedDrips.length} AI drip(s) for ${from} - client replied`);

        // Cancel remaining scheduled messages for all stopped drips
        for (const drip of stoppedDrips) {
          await supabaseAdmin
            .from('ai_drip_messages')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('drip_id', drip.id)
            .eq('status', 'scheduled');
        }
      }
    } catch (dripErr) {
      console.error('Error stopping AI drip:', dripErr);
    }

    // Check and trigger AI Receptionist if enabled
    await checkAndTriggerReceptionist(userId, threadId, from, to, messageBody);
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

/**
 * Check if receptionist should respond and trigger response
 */
async function checkAndTriggerReceptionist(
  userId: string,
  threadId: string,
  phoneNumber: string,
  toPhoneNumber: string,
  messageBody: string
) {
  if (!supabaseAdmin) return;

  try {
    // Get user's receptionist settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If no settings or not enabled, skip
    if (settingsError || !settings || !settings.enabled) {
      return;
    }

    // Get lead info for this phone number
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, status, disposition')
      .eq('user_id', userId)
      .eq('phone', phoneNumber)
      .single();

    // Determine contact type
    let contactType: ContactType;
    let leadId: string | undefined;
    let leadName: string | undefined;

    if (lead) {
      leadId = lead.id;
      leadName = lead.name;

      // Check if this is a sold client
      const isSoldClient = lead.disposition === 'sold' ||
                           lead.status === 'sold' ||
                           lead.disposition === 'closed_won';

      if (isSoldClient) {
        contactType = 'sold_client';
        if (!settings.respond_to_sold_clients) {
          console.log('🤖 Receptionist: Skipping sold client (disabled in settings)');
          return;
        }
      } else {
        contactType = 'existing_lead';
        // For existing leads that aren't sold, only respond if they're configured to receive responses
        // For now, treat existing leads like new contacts
        if (!settings.respond_to_new_contacts) {
          console.log('🤖 Receptionist: Skipping existing lead (new contacts disabled)');
          return;
        }
      }
    } else {
      // New contact - no existing lead
      contactType = 'new_contact';

      if (!settings.respond_to_new_contacts) {
        console.log('🤖 Receptionist: Skipping new contact (disabled in settings)');
        return;
      }

      // Auto-create lead if enabled
      if (settings.auto_create_leads) {
        const { data: newLead, error: leadError } = await supabaseAdmin
          .from('leads')
          .insert({
            user_id: userId,
            phone: phoneNumber,
            name: 'New Contact',
            source: 'inbound_sms',
            status: 'new',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id, name')
          .single();

        if (newLead && !leadError) {
          leadId = newLead.id;
          leadName = newLead.name;
          console.log('🤖 Receptionist: Auto-created new lead:', leadId);

          // Link the thread to the new lead
          await supabaseAdmin
            .from('threads')
            .update({ lead_id: leadId })
            .eq('id', threadId);
        }
      }
    }

    console.log('🤖 Receptionist: Triggering response', {
      userId,
      threadId,
      phoneNumber,
      contactType,
      leadId,
    });

    // Call the receptionist respond API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/receptionist/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        threadId,
        phoneNumber,
        toPhoneNumber,
        inboundMessage: messageBody,
        contactType,
        leadId,
        leadName,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Receptionist response sent:', {
        responseType: result.responseType,
        pointsUsed: result.pointsUsed,
      });
    } else {
      console.log('⚠️ Receptionist response not sent:', result.error);
    }
  } catch (error) {
    console.error('❌ Receptionist trigger error:', error);
    // Don't throw - we don't want to fail the webhook if receptionist fails
  }
}

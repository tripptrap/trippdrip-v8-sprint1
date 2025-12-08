// API Route: Twilio SMS Webhook
// This receives incoming SMS messages from Twilio

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

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

    // Convert URLSearchParams to plain object for signature validation
    const paramsObj: Record<string, string> = {};
    params.forEach((value, key) => {
      paramsObj[key] = value;
    });

    // SECURITY: Mandatory webhook signature validation
    const signature = req.headers.get('x-twilio-signature');
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    // Require both signature and auth token in production
    if (!authToken) {
      console.error('❌ TWILIO_AUTH_TOKEN not configured - cannot validate webhook');
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 500,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    if (!signature) {
      console.error('❌ Missing x-twilio-signature header - rejecting unsigned request');
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 403,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const url = req.url;
    const isValid = twilio.validateRequest(authToken, signature, url, paramsObj);

    if (!isValid) {
      console.error('⚠️ Invalid Twilio signature on SMS webhook - potential spoofed request');
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 403,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

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
        return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' }
        });
      }

      threadId = newThread.id;
    }

    // Process MMS media if present
    const mediaUrls: string[] = [];

    if (numMedia > 0) {
      console.log(`📎 Processing ${numMedia} media attachments...`);

      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaContentType = params.get(`MediaContentType${i}`);

        if (mediaUrl) {
          try {
            // Download media from Twilio (requires auth)
            const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
            if (!twilioAuthToken) {
              console.error('Missing TWILIO_AUTH_TOKEN for media download');
              continue;
            }

            // Fetch media with Twilio credentials
            const mediaResponse = await fetch(mediaUrl, {
              headers: {
                'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${twilioAuthToken}`).toString('base64'),
              },
            });

            if (!mediaResponse.ok) {
              console.error(`Failed to download media ${i}:`, mediaResponse.statusText);
              continue;
            }

            const mediaBuffer = await mediaResponse.arrayBuffer();
            const mediaBytes = new Uint8Array(mediaBuffer);

            // Generate unique filename
            const fileExtension = mediaContentType?.split('/')[1] || 'bin';
            const fileName = `${messageSid}_${i}.${fileExtension}`;
            const filePath = `mms/${userId}/${fileName}`;

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabaseAdmin
              .storage
              .from('message-media')
              .upload(filePath, mediaBytes, {
                contentType: mediaContentType || 'application/octet-stream',
                upsert: false,
              });

            if (uploadError) {
              console.error(`Error uploading media ${i}:`, uploadError);
              // Still try to save the Twilio URL as fallback
              mediaUrls.push(mediaUrl);
            } else {
              // Get public URL
              const { data: publicUrlData } = supabaseAdmin
                .storage
                .from('message-media')
                .getPublicUrl(filePath);

              mediaUrls.push(publicUrlData.publicUrl);
              console.log(`✅ Media ${i} uploaded: ${filePath}`);
            }
          } catch (error: any) {
            console.error(`Error processing media ${i}:`, error);
            // Fallback to Twilio URL
            mediaUrls.push(mediaUrl);
          }
        }
      }
    }

    // Save the message with media URLs
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
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        channel: numMedia > 0 ? 'mms' : 'sms',
        created_at: new Date().toISOString(),
      });

    if (messageError) {
      console.error('Error saving message:', messageError);
    } else {
      console.log('✅ Message saved successfully');
      if (mediaUrls.length > 0) {
        console.log(`✅ Saved ${mediaUrls.length} media URLs`);
      }
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

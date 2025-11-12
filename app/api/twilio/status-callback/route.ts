// API Route: Twilio Message Status Callback Handler
// Receives delivery status updates from Twilio for sent messages

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

// Create Supabase admin client (bypasses RLS for webhooks)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    // Parse form data from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    console.log('📊 Status callback received:', {
      MessageSid: params.MessageSid,
      MessageStatus: params.MessageStatus,
      To: params.To,
      From: params.From,
      ErrorCode: params.ErrorCode,
      ErrorMessage: params.ErrorMessage,
    });

    // Validate webhook signature for security
    const signature = req.headers.get('x-twilio-signature');
    if (signature) {
      const url = req.url;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (authToken) {
        const isValid = twilio.validateRequest(authToken, signature, url, params);

        if (!isValid) {
          console.error('⚠️ Invalid Twilio signature - potential spoofed request');
          return NextResponse.json(
            { error: 'Invalid signature' },
            { status: 403 }
          );
        }
      }
    }

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const messageSid = params.MessageSid;
    const messageStatus = params.MessageStatus; // sent, delivered, undelivered, failed
    const errorCode = params.ErrorCode;
    const errorMessage = params.ErrorMessage;

    if (!messageSid) {
      console.error('No MessageSid in callback');
      return NextResponse.json({ error: 'No MessageSid' }, { status: 400 });
    }

    // Update message status in sms_messages table
    const updateData: any = {
      twilio_status: messageStatus,
      updated_at: new Date().toISOString(),
    };

    // Add error details if message failed
    if (errorCode) {
      updateData.error_code = errorCode;
      updateData.error_message = errorMessage || null;
    }

    // Set delivered_at timestamp when message is delivered
    if (messageStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('sms_messages')
      .update(updateData)
      .eq('twilio_sid', messageSid);

    if (updateError) {
      console.error('Error updating message status:', updateError);
      // Don't return error to Twilio - we'll retry via their retry logic
    } else {
      console.log(`✅ Updated message ${messageSid} to status: ${messageStatus}`);
    }

    // Also update in messages table if it exists there
    await supabaseAdmin
      .from('messages')
      .update({
        status: messageStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('message_sid', messageSid);

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Status callback error:', error);
    return NextResponse.json(
      { error: error.message || 'Status callback handler failed' },
      { status: 500 }
    );
  }
}

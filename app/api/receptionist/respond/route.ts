// API Route: Generate Receptionist Response
// Internal API called from SMS webhook when receptionist mode is triggered

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReceptionistResponse } from '@/lib/receptionist/generateResponse';
import { ReceptionistSettings, ContactType, ReceptionistResponseParams } from '@/lib/receptionist/types';

// Use service role client for internal operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      threadId,
      phoneNumber,
      inboundMessage,
      contactType,
      leadId,
      leadName,
      toPhoneNumber, // The user's Telnyx number that received the message
    } = await req.json();

    if (!userId || !phoneNumber || !inboundMessage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get user's receptionist settings
    const { data: settings, error: settingsError } = await supabase
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings || !settings.enabled) {
      return NextResponse.json({
        success: false,
        error: 'Receptionist mode not enabled or configured',
      }, { status: 400 });
    }

    // Check user has premium subscription
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier, credits')
      .eq('id', userId)
      .single();

    const isPaid = userData?.subscription_tier === 'growth' || userData?.subscription_tier === 'scale';
    if (!isPaid) {
      return NextResponse.json({
        success: false,
        error: 'Paid subscription required',
      }, { status: 403 });
    }

    // Get conversation history from thread
    let conversationHistory: Array<{ direction: string; body: string }> = [];
    if (threadId) {
      const { data: messages } = await supabase
        .from('messages')
        .select('direction, body')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(20);

      if (messages) {
        conversationHistory = messages;
      }
    }

    // Generate AI response
    const params: ReceptionistResponseParams = {
      userId,
      threadId,
      phoneNumber,
      inboundMessage,
      contactType: contactType as ContactType,
      leadId,
      leadName,
      conversationHistory,
    };

    const result = await generateReceptionistResponse(params, settings as ReceptionistSettings);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }

    // Deduct points if applicable
    if (result.pointsUsed && result.pointsUsed > 0) {
      const currentCredits = userData?.credits || 0;
      if (currentCredits < result.pointsUsed) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient credits',
        }, { status: 402 });
      }

      await supabase
        .from('users')
        .update({ credits: currentCredits - result.pointsUsed })
        .eq('id', userId);
    }

    // Send the SMS response using Telnyx
    const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/telnyx/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phoneNumber,
        from: toPhoneNumber,
        body: result.response,
        userId,
        threadId,
        leadId,
        isAutomated: true,
      }),
    });

    const sendResult = await sendResponse.json();

    if (!sendResult.success) {
      console.error('Failed to send receptionist response:', sendResult.error);
      return NextResponse.json({
        success: false,
        error: 'Failed to send response',
      }, { status: 500 });
    }

    // Log the interaction
    await supabase
      .from('receptionist_logs')
      .insert({
        user_id: userId,
        thread_id: threadId,
        lead_id: leadId,
        phone_number: phoneNumber,
        contact_type: contactType,
        inbound_message: inboundMessage,
        ai_response: result.response,
        response_type: result.responseType,
        points_used: result.pointsUsed || 0,
      });

    return NextResponse.json({
      success: true,
      response: result.response,
      responseType: result.responseType,
      pointsUsed: result.pointsUsed,
      messageSent: true,
    });

  } catch (error: any) {
    console.error('Receptionist respond error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}

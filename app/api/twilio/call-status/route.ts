// API Route: Twilio Call Status Callback
// Receives call status updates from Twilio

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

    console.log('📊 Call status update:', {
      CallSid: params.CallSid,
      CallStatus: params.CallStatus,
      CallDuration: params.CallDuration,
      From: params.From,
      To: params.To,
    });

    // Validate webhook signature for security
    const signature = req.headers.get('x-twilio-signature');
    if (signature) {
      const url = req.url;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (authToken) {
        const isValid = twilio.validateRequest(authToken, signature, url, params);

        if (!isValid) {
          console.error('⚠️ Invalid Twilio signature on call status webhook');
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

    const callSid = params.CallSid;
    const callStatus = params.CallStatus; // initiated, ringing, in-progress, completed, busy, failed, no-answer, canceled
    const callDuration = params.CallDuration ? parseInt(params.CallDuration) : null;

    if (!callSid) {
      console.error('No CallSid in callback');
      return NextResponse.json({ error: 'No CallSid' }, { status: 400 });
    }

    // Update call status in database
    const updateData: any = {
      status: callStatus,
      updated_at: new Date().toISOString(),
    };

    // Add duration when call completes
    if (callDuration !== null && callStatus === 'completed') {
      updateData.duration = callDuration;
      updateData.ended_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('twilio_calls')
      .update(updateData)
      .eq('call_sid', callSid);

    if (updateError) {
      console.error('Error updating call status:', updateError);
    } else {
      console.log(`✅ Updated call ${callSid} to status: ${callStatus}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Call status callback error:', error);
    return NextResponse.json(
      { error: error.message || 'Call status callback handler failed' },
      { status: 500 }
    );
  }
}

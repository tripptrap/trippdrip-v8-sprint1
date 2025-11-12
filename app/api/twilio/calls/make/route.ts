// API Route: Make Outbound Voice Call via Twilio
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTwilioCredentials } from '@/lib/twilioSubaccounts';
import twilio from 'twilio';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { to, from, leadId, recordCall = false } = body;

    if (!to || !from) {
      return NextResponse.json(
        { error: 'Missing required fields: to, from' },
        { status: 400 }
      );
    }

    // Get user's Twilio subaccount credentials
    const credentials = await getUserTwilioCredentials(user.id);

    if (!credentials.success || !credentials.accountSid || !credentials.authToken) {
      return NextResponse.json(
        { error: 'Twilio subaccount not configured for this user' },
        { status: 400 }
      );
    }

    // Create Twilio client with user's subaccount
    const twilioClient = twilio(credentials.accountSid, credentials.authToken);

    // TwiML URL for handling the call
    const twimlUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/voice-twiml?userId=${user.id}&leadId=${leadId || ''}`;

    // Status callback URL
    const statusCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/call-status`;

    // Make the call
    const call = await twilioClient.calls.create({
      to: to,
      from: from,
      url: twimlUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: recordCall,
      recordingStatusCallback: recordCall
        ? `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/recording-status`
        : undefined,
      recordingStatusCallbackMethod: 'POST',
    });

    console.log('📞 Outbound call initiated:', {
      callSid: call.sid,
      to,
      from,
      userId: user.id,
    });

    // Save call record to database
    const { error: dbError } = await supabase.from('twilio_calls').insert({
      user_id: user.id,
      call_sid: call.sid,
      from_number: from,
      to_number: to,
      direction: 'outbound',
      status: call.status,
      lead_id: leadId || null,
      recording_enabled: recordCall,
      created_at: new Date().toISOString(),
    });

    if (dbError) {
      console.error('Error saving call record:', dbError);
      // Don't fail the request if DB save fails
    }

    return NextResponse.json({
      success: true,
      callSid: call.sid,
      status: call.status,
    });
  } catch (error: any) {
    console.error('Error making call:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to make call' },
      { status: 500 }
    );
  }
}

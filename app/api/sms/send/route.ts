// API Route: Send SMS via Twilio

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { spendPointsForAction } from '@/lib/pointsSupabase';

export async function POST(req: NextRequest) {
  try {
    const { to, from, message, accountSid, authToken, isBulk } = await req.json();

    // Validate inputs
    if (!to || !from || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, from, message' },
        { status: 400 }
      );
    }

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: 'Twilio credentials not provided' },
        { status: 400 }
      );
    }

    // Check and deduct points BEFORE sending
    const actionType = isBulk ? 'bulk_message' : 'sms_sent';
    const pointsResult = await spendPointsForAction(actionType, 1);

    if (!pointsResult.success) {
      return NextResponse.json(
        { error: pointsResult.error || 'Insufficient points' },
        { status: 402 } // Payment Required
      );
    }

    // Make request to Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', from);
    params.append('Body', message);

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', result);
      return NextResponse.json(
        {
          error: result.message || 'Failed to send SMS',
          code: result.code,
          details: result
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.sid,
      status: result.status,
      to: result.to,
      from: result.from,
      pointsDeducted: isBulk ? 2 : 1,
      remainingBalance: pointsResult.balance
    });

  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

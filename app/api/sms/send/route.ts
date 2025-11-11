// API Route: Send SMS via Twilio with full tracking and analytics

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { spendPointsForAction } from '@/lib/pointsSupabase';
import { sendSMS } from '@/lib/twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SendSMSRequest {
  // Legacy support
  to?: string;
  from?: string;
  message?: string;
  accountSid?: string;
  authToken?: string;
  isBulk?: boolean;

  // New parameters
  leadId?: string;
  campaignId?: string;
  toPhone?: string;
  messageBody?: string;
  templateId?: string;
  isAutomated?: boolean;
  channel?: 'sms' | 'whatsapp'; // Channel type
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body: SendSMSRequest = await req.json();

    // Support both old and new parameter formats
    const toPhone = body.toPhone || body.to;
    const messageBody = body.messageBody || body.message;
    const fromPhone = body.from || process.env.TWILIO_PHONE_NUMBER;
    const { leadId, campaignId, templateId, isAutomated = false, isBulk = false, channel = 'sms' } = body;

    // Validate inputs
    if (!toPhone || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields: toPhone/to and messageBody/message' },
        { status: 400 }
      );
    }

    if (!fromPhone) {
      return NextResponse.json(
        { error: 'Twilio phone number not configured' },
        { status: 500 }
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

    console.log(`📤 Sending ${channel.toUpperCase()} to ${toPhone}...`);

    // Send SMS or WhatsApp via Twilio utility
    const result = await sendSMS({
      to: toPhone,
      message: messageBody,
      from: fromPhone,
      channel,
    });

    if (!result.success) {
      console.error('❌ SMS send failed:', result.error);

      // Log failed SMS to database
      await supabase.from('sms_messages').insert({
        user_id: user.id,
        lead_id: leadId || null,
        campaign_id: campaignId || null,
        to_phone: toPhone,
        from_phone: fromPhone,
        message_body: messageBody,
        twilio_status: 'failed',
        twilio_error_message: result.error,
        template_id: templateId || null,
        is_automated: isAutomated,
        cost_points: isBulk ? 2 : 1,
        failed_at: new Date().toISOString(),
      });

      // Log activity for lead if leadId provided
      if (leadId) {
        await supabase.from('lead_activities').insert({
          user_id: user.id,
          lead_id: leadId,
          activity_type: 'sms_sent',
          title: 'SMS Failed',
          description: `Failed to send SMS: ${result.error}`,
          metadata: { toPhone, error: result.error },
        });
      }

      return NextResponse.json(
        {
          error: result.error || 'Failed to send SMS',
          success: false,
        },
        { status: 500 }
      );
    }

    console.log(`✅ SMS sent successfully! SID: ${result.messageSid}, Status: ${result.status}`);

    // Log successful SMS to database
    const { data: smsMessage } = await supabase
      .from('sms_messages')
      .insert({
        user_id: user.id,
        lead_id: leadId || null,
        campaign_id: campaignId || null,
        to_phone: toPhone,
        from_phone: fromPhone,
        message_body: messageBody,
        twilio_sid: result.messageSid,
        twilio_status: result.status || 'sent',
        template_id: templateId || null,
        is_automated: isAutomated,
        cost_points: isBulk ? 2 : 1,
      })
      .select()
      .single();

    // Log activity for lead if leadId provided
    if (leadId && smsMessage) {
      await supabase.from('lead_activities').insert({
        user_id: user.id,
        lead_id: leadId,
        activity_type: 'sms_sent',
        title: 'SMS Sent',
        description: messageBody.substring(0, 100) + (messageBody.length > 100 ? '...' : ''),
        metadata: { toPhone, messageSid: result.messageSid },
        sms_message_id: smsMessage.id,
      });
    }

    // Return response in both old and new formats
    return NextResponse.json({
      success: true,
      messageId: result.messageSid,
      status: result.status,
      to: toPhone,
      from: fromPhone,
      pointsDeducted: isBulk ? 2 : 1,
      remainingBalance: pointsResult.balance,
      smsMessageId: smsMessage?.id,
    });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

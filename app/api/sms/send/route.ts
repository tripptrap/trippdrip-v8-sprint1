// API Route: Send SMS via Telnyx with full tracking and analytics

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { spendPointsForAction } from '@/lib/pointsSupabaseServer';
import { sendTelnyxSMS } from '@/lib/telnyx';

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
  channel?: 'sms' | 'rcs'; // Channel type
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
    const fromPhone = body.from; // Telnyx will use number from messaging profile if not provided
    const { leadId, campaignId, templateId, isAutomated = false, isBulk = false, channel = 'sms' } = body;

    // Validate inputs
    if (!toPhone || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields: toPhone/to and messageBody/message' },
        { status: 400 }
      );
    }

    // Check DNC list BEFORE sending
    const { data: dncCheck, error: dncError } = await supabase.rpc('check_dnc', {
      p_user_id: user.id,
      p_phone_number: toPhone
    });

    if (dncError) {
      console.error('Error checking DNC list:', dncError);
    } else if (dncCheck) {
      const dncResult = typeof dncCheck === 'string' ? JSON.parse(dncCheck) : dncCheck;

      if (dncResult.on_dnc_list) {
        console.log(`🚫 Message blocked - ${toPhone} is on DNC list (${dncResult.on_user_list ? 'user' : 'global'} list, reason: ${dncResult.reason})`);

        // Log blocked message to history
        await supabase.from('dnc_history').insert({
          user_id: user.id,
          phone_number: toPhone,
          normalized_phone: dncResult.normalized_phone,
          action: 'blocked',
          list_type: dncResult.on_user_list ? 'user' : 'global',
          result: true,
          metadata: {
            reason: dncResult.reason,
            source: dncResult.source,
            message_body: messageBody,
            campaign_id: campaignId
          }
        });

        return NextResponse.json(
          {
            error: 'Message blocked: Recipient is on Do Not Call list',
            on_dnc_list: true,
            dnc_reason: dncResult.reason,
            list_type: dncResult.on_user_list ? 'user' : 'global'
          },
          { status: 403 } // Forbidden
        );
      }
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

    console.log(`📤 Sending ${channel.toUpperCase()} to ${toPhone} via Telnyx...`);

    // Send SMS via Telnyx
    const result = await sendTelnyxSMS({
      to: toPhone,
      message: messageBody,
      from: fromPhone,
    });

    if (!result.success) {
      console.error('❌ SMS send failed:', result.error);

      // Log failed SMS to database
      await supabase.from('sms_messages').insert({
        user_id: user.id,
        lead_id: leadId || null,
        campaign_id: campaignId || null,
        to_phone: toPhone,
        from_phone: fromPhone || result.from,
        message_body: messageBody,
        twilio_status: 'failed',
        twilio_error_message: result.error,
        template_id: templateId || null,
        is_automated: isAutomated,
        cost_points: isBulk ? 2 : 1,
        failed_at: new Date().toISOString(),
        provider: 'telnyx',
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

    // Use from number from result or the one we provided
    const actualFromPhone = result.from || fromPhone;

    console.log(`✅ SMS sent successfully via Telnyx! SID: ${result.messageSid}, Status: ${result.status}, From: ${actualFromPhone}`);

    // Log successful SMS to database
    const { data: smsMessage } = await supabase
      .from('sms_messages')
      .insert({
        user_id: user.id,
        lead_id: leadId || null,
        campaign_id: campaignId || null,
        to_phone: toPhone,
        from_phone: actualFromPhone,
        message_body: messageBody,
        twilio_sid: result.messageSid,
        twilio_status: result.status || 'sent',
        template_id: templateId || null,
        is_automated: isAutomated,
        cost_points: isBulk ? 2 : 1,
        provider: 'telnyx',
      })
      .select()
      .single();

    // Create or update thread for this conversation
    const { data: existingThread } = await supabase
      .from('threads')
      .select('id, messages_from_user')
      .eq('user_id', user.id)
      .eq('phone_number', toPhone)
      .eq('channel', channel)
      .single();

    let threadId: string;

    if (existingThread) {
      // Update existing thread
      const { data: updatedThread } = await supabase
        .from('threads')
        .update({
          last_message: messageBody.substring(0, 255),
          updated_at: new Date().toISOString(),
          messages_from_user: (existingThread.messages_from_user || 0) + 1,
        })
        .eq('id', existingThread.id)
        .select('id')
        .single();

      threadId = updatedThread?.id || existingThread.id;
    } else {
      // Create new thread
      const { data: newThread } = await supabase
        .from('threads')
        .insert({
          user_id: user.id,
          phone_number: toPhone,
          channel: channel,
          last_message: messageBody.substring(0, 255),
          messages_from_user: 1,
          messages_from_lead: 0,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      threadId = newThread?.id || '';
    }

    // Add message to thread with automation tracking
    if (threadId) {
      // Determine automation source
      let automationSource = null;
      if (isAutomated) {
        if (templateId) {
          automationSource = 'flow';
        } else if (campaignId) {
          automationSource = isBulk ? 'bulk_campaign' : 'drip_campaign';
        } else {
          automationSource = 'scheduled';
        }
      }

      await supabase.from('messages').insert({
        thread_id: threadId,
        sender: actualFromPhone,
        recipient: toPhone,
        body: messageBody,
        direction: 'outbound',
        status: result.status || 'sent',
        message_sid: result.messageSid,
        created_at: new Date().toISOString(),
        is_automated: isAutomated,
        automation_source: automationSource,
        flow_id: templateId || null,
        campaign_id: campaignId || null,
        user_id: user.id,
        lead_id: leadId || null,
        provider: 'telnyx',
      });
    }

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
      from: actualFromPhone,
      pointsDeducted: isBulk ? 2 : 1,
      remainingBalance: pointsResult.balance,
      smsMessageId: smsMessage?.id,
      provider: 'telnyx',
    });
  } catch (error) {
    console.error('SMS send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

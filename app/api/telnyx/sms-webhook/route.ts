// API Route: Telnyx SMS Webhook
// This receives incoming SMS messages from Telnyx

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { ContactType } from '@/lib/receptionist/types';
import { detectSpam } from '@/lib/spam/detector';
import { sendTelnyxSMS } from '@/lib/telnyx';
import { sendSmsAlertToUser } from '@/lib/sendSmsAlert';

// Opt-out keywords that trigger permanent DNC (STOP, UNSUBSCRIBE, etc.)
// LOW-5: "cancel" removed — it's too common in normal sentences ("cancel my appointment").
//        Appointment cancellations are handled separately by CANCEL_KEYWORDS below.
const OPT_OUT_KEYWORDS = [
  'stop', 'unsubscribe', 'quit', 'opt out', 'optout',
  'remove me', 'stop texting', 'don\'t text', 'dont text',
  'no more texts', 'leave me alone', 'take me off', 'end', 'halt'
];

function isOptOut(message: string, customKeyword?: string | null): boolean {
  const lower = message.trim().toLowerCase();
  // Check user's custom opt-out keyword first (exact match)
  if (customKeyword && lower === customKeyword.toLowerCase()) return true;
  // Exact whole-message match
  if (OPT_OUT_KEYWORDS.includes(lower)) return true;
  // LOW-5: For multi-word phrases, require word-boundary match to avoid false positives
  // (e.g. "remove me" must appear as a phrase, not just "remove")
  return OPT_OUT_KEYWORDS.some(kw => {
    if (kw.length <= 4) return false; // handled by exact match above
    // Word-boundary check: phrase must not be part of a larger word
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i').test(lower);
  });
}

const CANCEL_KEYWORDS = ['cancel', 'cancel appointment', 'cancel my appointment', 'cant make it', "can't make it", 'no longer need'];
const RESCHEDULE_KEYWORDS = ['reschedule', 'move appointment', 'different time', 'change appointment', 'change time', 'new time'];

function isAppointmentCancel(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return CANCEL_KEYWORDS.some(kw => lower.includes(kw));
}

function isAppointmentReschedule(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return RESCHEDULE_KEYWORDS.some(kw => lower.includes(kw));
}

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

    // CRIT-3: Verify signature whenever TELNYX_PUBLIC_KEY is set — not just in production.
    // Skipping verification in dev/staging allows forged webhooks to be accepted.
    if (publicKey && (!signature || !timestamp)) {
      console.error('❌ Missing Telnyx webhook signature headers (TELNYX_PUBLIC_KEY is set, verification required)');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    if (publicKey && signature && timestamp) {
      // Ed25519 verification: validate using Telnyx public key
      try {
        const ed25519Sig = Buffer.from(signature, 'base64');
        const signedPayload = `${timestamp}|${rawBody}`;
        const publicKeyBuffer = Buffer.from(publicKey, 'base64');
        const isValid = crypto.verify(
          null, // Ed25519 doesn't use a digest algorithm
          Buffer.from(signedPayload),
          { key: publicKeyBuffer, format: 'der', type: 'spki' },
          ed25519Sig
        );
        if (!isValid) {
          console.error('❌ Invalid Telnyx webhook signature');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } catch (verifyErr) {
        // CRIT-3: Reject on verification error whenever TELNYX_PUBLIC_KEY is configured
        console.error('❌ Webhook signature verification error:', verifyErr);
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
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

  // HIGH-6: Identify tenant by the RECEIVING number (to) first — this definitively
  // determines which user account the message belongs to. Starting with the sender's
  // phone or lead lookup can route to the wrong tenant if two tenants have the same lead.
  let userId: string | null = null;

  // Step 1: Look up the receiving number in user_telnyx_numbers to identify the tenant
  const { data: telnyxNumber } = await supabaseAdmin
    .from('user_telnyx_numbers')
    .select('user_id')
    .eq('phone_number', to)
    .eq('status', 'active')
    .single();

  if (telnyxNumber) {
    userId = telnyxNumber.user_id;
    console.log('Found user via Telnyx number (to):', userId);
  }

  // Step 2: Fallback — check existing threads scoped to this user (or any user if not found)
  if (!userId) {
    const { data: existingThread } = await supabaseAdmin
      .from('threads')
      .select('user_id')
      .eq('phone_number', from)
      .single();

    if (existingThread) {
      userId = existingThread.user_id;
      console.log('Found user via existing thread:', userId);
    }
  }

  // Step 3: Last fallback — lead lookup by sender phone
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

  if (!userId) {
    console.error('Could not find user for incoming message. From:', from, 'To:', to);
    return;
  }

  // Look up lead for this phone number (needed for message insert)
  let leadId: string | null = null;
  const { data: leadData } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('user_id', userId)
    .eq('phone', from)
    .single();

  if (leadData) {
    leadId = leadData.id;
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
    const threadInsert: Record<string, any> = {
      user_id: userId,
      phone_number: from,
      channel: 'sms',
      status: 'active',
      last_message: messageBody,
      messages_from_lead: 1,
      messages_from_user: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (leadId) {
      threadInsert.lead_id = leadId;
    }
    const { data: newThread, error: threadError } = await supabaseAdmin
      .from('threads')
      .insert(threadInsert)
      .select('id')
      .single();

    if (threadError || !newThread) {
      console.error('Error creating thread:', threadError);
      return;
    }

    threadId = newThread.id;
  }

  // Deduplicate: check if this message was already processed (webhook retry)
  if (messageSid) {
    const { data: existingMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('message_sid', messageSid)
      .single();

    if (existingMsg) {
      console.log('⚠️ Duplicate webhook for message_sid:', messageSid, '— skipping');
      return;
    }
  }

  // Save the message
  console.log('💾 Saving inbound message:', { userId, threadId, from, to, messageBody: messageBody?.substring(0, 50) });

  // Fetch user's custom opt-out keyword
  let userOptOutKeyword: string | null = null;
  const { data: userSettings } = await supabaseAdmin
    .from('user_settings')
    .select('opt_out_keyword')
    .eq('user_id', userId)
    .single();
  userOptOutKeyword = userSettings?.opt_out_keyword || null;

  // Run spam detection on inbound message
  const spamResult = messageBody ? detectSpam(messageBody) : null;
  const optOut = messageBody ? isOptOut(messageBody, userOptOutKeyword) : false;

  // If opt-out, boost spam score and add flag
  const spamScore = optOut ? Math.max(spamResult?.spamScore || 0, 50) : (spamResult?.spamScore || 0);
  const spamFlags = [
    ...(spamResult?.detectedWords || []).map((w: any) => typeof w === 'string' ? w : w.word || String(w)),
    ...(optOut ? ['OPT_OUT_REQUEST'] : []),
  ];

  const messageData: Record<string, any> = {
    user_id: userId,
    thread_id: threadId,
    lead_id: leadId,
    from_phone: from,
    to_phone: to,
    body: messageBody,
    content: messageBody,
    direction: 'inbound',
    status: 'delivered',
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

    // Send SMS alert to user's personal phone (new inbound message)
    if (!optOut) {
      const { data: leadForAlert } = await supabaseAdmin
        .from('leads')
        .select('first_name, last_name')
        .eq('user_id', userId)
        .eq('phone', from)
        .single();
      const leadName = leadForAlert
        ? [leadForAlert.first_name, leadForAlert.last_name].filter(Boolean).join(' ')
        : undefined;
      sendSmsAlertToUser(userId, 'new_message', {
        leadName: leadName || undefined,
        leadPhone: from,
        message: messageBody,
      }).catch(err => console.error('SMS alert (new_message) failed:', err));
    }

    // Handle opt-out: add to DNC list, update lead, skip receptionist
    if (optOut) {
      console.log(`🚫 Opt-out detected from ${from}: "${messageBody}"`);

      try {
        // Add to user's DNC list
        await supabaseAdmin
          .from('dnc_list')
          .upsert({
            user_id: userId,
            phone_number: from,
            reason: 'opt_out',
            source: 'inbound_sms',
            created_at: new Date().toISOString(),
          }, { onConflict: 'user_id,phone_number' });

        console.log(`✅ Added ${from} to DNC list for user ${userId}`);

        // Send SMS alert to user's personal phone (opt-out)
        sendSmsAlertToUser(userId, 'opt_out', {
          leadPhone: from,
        }).catch(err => console.error('SMS alert (opt_out) failed:', err));

        // Log DNC history
        await supabaseAdmin
          .from('dnc_history')
          .insert({
            user_id: userId,
            phone_number: from,
            action: 'added',
            reason: 'opt_out',
            source: 'inbound_sms',
            notes: `Lead texted: "${messageBody}"`,
            created_at: new Date().toISOString(),
          });

        // Update lead's sms_opt_in to false
        const { data: updatedLead } = await supabaseAdmin
          .from('leads')
          .update({
            sms_opt_in: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('phone', from)
          .select('id');

        if (updatedLead && updatedLead.length > 0) {
          console.log(`✅ Set sms_opt_in=false for lead with phone ${from}`);
        }
      } catch (dncErr) {
        console.error('Error handling opt-out DNC:', dncErr);
      }

      // Do NOT trigger receptionist for opt-out messages
      return;
    }

    // Handle appointment cancel/reschedule via SMS (only if NOT an opt-out)
    if (messageBody && leadId && !optOut) {
      const wantsCancel = isAppointmentCancel(messageBody);
      const wantsReschedule = isAppointmentReschedule(messageBody);

      if (wantsCancel || wantsReschedule) {
        try {
          // Look up lead's next upcoming appointment
          const { data: upcomingAppt } = await supabaseAdmin
            .from('calendar_events')
            .select('id, google_event_id')
            .eq('lead_id', leadId)
            .gt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .single();

          if (upcomingAppt) {
            // Look up user's primary Telnyx number for the reply
            const { data: telnyxNum } = await supabaseAdmin
              .from('user_telnyx_numbers')
              .select('phone_number')
              .eq('user_id', userId)
              .eq('status', 'active')
              .order('is_primary', { ascending: false })
              .limit(1)
              .single();

            const replyFrom = telnyxNum?.phone_number || to;

            if (wantsCancel) {
              // Update calendar_event as cancelled
              await supabaseAdmin
                .from('calendar_events')
                .update({
                  cancellation_status: 'cancelled',
                  cancellation_reason: 'Cancelled via SMS',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', upcomingAppt.id);

              // MED-3: Try to delete from Google Calendar — refresh token if access token expired
              if (upcomingAppt.google_event_id) {
                try {
                  const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('google_calendar_access_token, google_calendar_refresh_token')
                    .eq('id', userId)
                    .single();

                  if (userData?.google_calendar_access_token && upcomingAppt.google_event_id) {
                    let accessToken = userData.google_calendar_access_token;

                    const gcalResponse = await fetch(
                      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${upcomingAppt.google_event_id}`,
                      { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
                    );

                    // Token expired — attempt refresh and retry once
                    if (gcalResponse.status === 401 && userData.google_calendar_refresh_token) {
                      try {
                        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                          body: new URLSearchParams({
                            client_id: process.env.GOOGLE_CLIENT_ID || '',
                            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                            refresh_token: userData.google_calendar_refresh_token,
                            grant_type: 'refresh_token',
                          }),
                        });
                        if (refreshRes.ok) {
                          const refreshData = await refreshRes.json();
                          accessToken = refreshData.access_token;
                          // Persist refreshed token
                          await supabaseAdmin.from('users').update({
                            google_calendar_access_token: accessToken,
                            updated_at: new Date().toISOString(),
                          }).eq('id', userId);
                          // Retry delete with new token
                          await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${upcomingAppt.google_event_id}`,
                            { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
                          );
                        }
                      } catch (refreshErr) {
                        console.error('Google Calendar token refresh failed:', refreshErr);
                      }
                    } else if (!gcalResponse.ok && gcalResponse.status !== 404) {
                      console.error('Failed to delete appointment from Google Calendar:', gcalResponse.status);
                    }
                  }
                } catch (gcalErr) {
                  console.error('Error deleting from Google Calendar:', gcalErr);
                }
              }

              // Update lead: appointment_scheduled = false
              await supabaseAdmin
                .from('leads')
                .update({
                  appointment_scheduled: false,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', leadId);

              // Send confirmation SMS
              await sendTelnyxSMS({
                to: from,
                from: replyFrom,
                message: "Your appointment has been cancelled. If you'd like to reschedule, just reply RESCHEDULE.",
              });

              // Log activity
              await supabaseAdmin
                .from('lead_activities')
                .insert({
                  user_id: userId,
                  lead_id: leadId,
                  activity_type: 'appointment_cancelled',
                  title: 'Appointment Cancelled',
                  description: 'Appointment cancelled via SMS',
                  metadata: { source: 'sms' },
                  created_at: new Date().toISOString(),
                });

              console.log(`Appointment cancelled via SMS for lead ${leadId}`);
            } else if (wantsReschedule) {
              // Update calendar_event as rescheduled
              await supabaseAdmin
                .from('calendar_events')
                .update({
                  cancellation_status: 'rescheduled',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', upcomingAppt.id);

              // Send SMS to prompt for new time
              await sendTelnyxSMS({
                to: from,
                from: replyFrom,
                message: "No problem! I'll help you find a new time. What day and time works better for you?",
              });

              console.log(`Appointment reschedule initiated via SMS for lead ${leadId}`);
              // Let the receptionist/flow AI take over from here
            }
          }
          // If no upcoming appointment found, fall through to normal handling
        } catch (apptErr) {
          console.error('Error handling appointment cancel/reschedule:', apptErr);
          // Don't block normal flow on error
        }
      }
    }

    // Stop-on-reply: pause any active drip campaign enrollments for this lead
    try {
      const { data: replyLead } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('phone', from)
        .single();

      if (replyLead) {
        const { data: pausedEnrollments } = await supabaseAdmin
          .from('drip_campaign_enrollments')
          .update({ status: 'paused_reply', paused_at: new Date().toISOString() })
          .eq('lead_id', replyLead.id)
          .eq('status', 'active')
          .select('id');

        if (pausedEnrollments && pausedEnrollments.length > 0) {
          console.log(`⏸️ Paused ${pausedEnrollments.length} drip enrollment(s) for lead ${replyLead.id} due to reply`);
        }
      }
    } catch (stopErr) {
      console.error('Error pausing drip enrollments on reply:', stopErr);
    }

    // Fire auto-tagging rules for message_received and lead_replied triggers
    if (leadId) {
      try {
        // message_received fires on every inbound message
        const { error: atErr1 } = await supabaseAdmin
          .rpc('execute_auto_tagging_rule', {
            p_user_id: userId,
            p_lead_id: leadId,
            p_trigger_type: 'message_received',
            p_trigger_data: { phone: from, message: messageBody },
          });
        if (atErr1) console.error('Auto-tag (message_received) error:', atErr1);

        // lead_replied fires on every inbound message (treat every reply as a "reply" event)
        const { error: atErr2 } = await supabaseAdmin
          .rpc('execute_auto_tagging_rule', {
            p_user_id: userId,
            p_lead_id: leadId,
            p_trigger_type: 'lead_replied',
            p_trigger_data: { phone: from, message: messageBody },
          });
        if (atErr2) console.error('Auto-tag (lead_replied) error:', atErr2);
      } catch (autoTagErr) {
        console.error('Error firing auto-tagging rules:', autoTagErr);
      }
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

    // Check if user has taken over this conversation (ai_disabled flag)
    const { data: threadData } = await supabaseAdmin
      .from('threads')
      .select('ai_disabled')
      .eq('id', threadId)
      .single();

    if (threadData?.ai_disabled) {
      console.log('🤖 Receptionist: Skipping — user has taken over this conversation');
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
    let flowContext: import('@/lib/receptionist/types').FlowContext | null = null;

    if (lead) {
      leadId = lead.id;
      leadName = lead.name;

      // Sold/converted clients skip Flow AI entirely — Receptionist handles them
      const isSoldEarly = lead.disposition === 'sold' ||
                          lead.status === 'sold' ||
                          lead.disposition === 'closed_won';

      if (!isSoldEarly) {
      // Check if lead has a flow assigned — respect its autonomy mode
      // Also check campaign's auto_trigger_flow setting
      const { data: leadDetail } = await supabaseAdmin
        .from('leads')
        .select('flow_id, campaign_id')
        .eq('id', lead.id)
        .single();

      let effectiveFlowId = leadDetail?.flow_id;

      // If lead has no flow but their campaign has auto_trigger_flow enabled, assign it
      if (!effectiveFlowId && leadDetail?.campaign_id) {
        const { data: campaignData } = await supabaseAdmin
          .from('campaigns')
          .select('flow_id, auto_trigger_flow')
          .eq('id', leadDetail.campaign_id)
          .single();

        if (campaignData?.auto_trigger_flow && campaignData?.flow_id) {
          effectiveFlowId = campaignData.flow_id;
          // Assign the flow to this lead so future messages use it directly
          await supabaseAdmin
            .from('leads')
            .update({ flow_id: campaignData.flow_id })
            .eq('id', lead.id);
          console.log(`🤖 Auto-assigned campaign flow ${campaignData.flow_id} to lead ${lead.id}`);
        }
      }

      if (effectiveFlowId) {
        // Fetch full flow data — required_questions, steps, and context (autonomy + identity)
        const { data: flowData } = await supabaseAdmin
          .from('conversation_flows')
          .select('name, required_questions, context')
          .eq('id', effectiveFlowId)
          .single();

        const flowAutonomyMode = flowData?.context?.autonomyMode || 'full_auto';
        if (flowAutonomyMode === 'manual') {
          console.log('🤖 Receptionist: Skipping — assigned flow is in manual mode');
          return;
        }

        // ── Extract answers & update conversation state ──────────────────────
        const requiredQuestions: Array<{ question: string; fieldName: string }> =
          flowData?.required_questions || [];

        if (requiredQuestions.length > 0 && lead?.id) {
          // Load current collected info from lead.conversation_state
          const { data: leadState } = await supabaseAdmin
            .from('leads')
            .select('conversation_state, tags, primary_tag')
            .eq('id', lead.id)
            .single();

          const currentCollected: Record<string, string> =
            (leadState?.conversation_state as any)?.collectedInfo || {};

          // Determine which questions still need answers
          const remaining = requiredQuestions.filter(
            q => !currentCollected[q.fieldName]
          );

          // Extract any answers from this message (non-blocking)
          let newlyExtracted: Record<string, string> = {};
          if (remaining.length > 0) {
            try {
              const { extractFlowAnswers } = await import('@/lib/ai/extractFlowAnswers');
              newlyExtracted = await extractFlowAnswers(messageBody, remaining, currentCollected);
            } catch (extractErr) {
              console.error('🤖 Answer extraction failed (non-fatal):', extractErr);
            }
          }

          // Merge and persist updated collectedInfo
          const updatedCollected = { ...currentCollected, ...newlyExtracted };
          const updatedRemaining = requiredQuestions.filter(
            q => !updatedCollected[q.fieldName]
          );
          const allAnswered = updatedRemaining.length === 0 && requiredQuestions.length > 0;

          if (Object.keys(newlyExtracted).length > 0) {
            await supabaseAdmin
              .from('leads')
              .update({
                conversation_state: {
                  ...(leadState?.conversation_state as any || {}),
                  collectedInfo: updatedCollected,
                  lastUpdated: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);

            console.log('🤖 Flow answers extracted:', newlyExtracted);
          }

          // Auto-tag when all required questions are answered
          if (allAnswered) {
            const existingTags: string[] = leadState?.tags || [];
            const qualifiedTag = 'qualified';
            if (!existingTags.includes(qualifiedTag)) {
              const newTags = [...new Set([...existingTags, qualifiedTag])];
              await supabaseAdmin
                .from('leads')
                .update({
                  tags: newTags,
                  primary_tag: qualifiedTag,
                  status: 'qualified',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', lead.id);
              console.log('🤖 Flow complete — lead auto-tagged "qualified"');
            }
          }

          // Build flowContext to pass to the AI so it knows what to ask next
          flowContext = {
            flowName: flowData?.name || 'Qualification Flow',
            requiredQuestions,
            collectedInfo: updatedCollected,
            remainingQuestions: updatedRemaining,
            allAnswered,
          };
        }

        // 'suggest' mode: generate draft and store on thread, notify user — don't auto-send
        if (flowAutonomyMode === 'suggest') {
          console.log('🤖 Receptionist: Suggest mode — generating draft for user review');
          try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            await fetch(`${baseUrl}/api/receptionist/respond`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': process.env.CRON_SECRET || '',
              },
              body: JSON.stringify({
                userId,
                threadId,
                phoneNumber,
                toPhoneNumber,
                inboundMessage: messageBody,
                contactType: 'existing_lead',
                leadId: lead?.id,
                leadName: (lead as any)?.first_name || lead?.name || 'Lead',
                draftOnly: true,
                flowContext,
              }),
            });
          } catch (err) {
            console.error('🤖 Suggest mode draft generation failed:', err);
          }
          return;
        }
        // 'full_auto': proceed normally (flowContext will be passed to receptionist below)
      }
      } // end !isSoldEarly — flow block

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

    // Call the receptionist respond API — pass flowContext so AI knows what to ask next
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/receptionist/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        threadId,
        phoneNumber,
        toPhoneNumber,
        inboundMessage: messageBody,
        contactType,
        leadId,
        leadName,
        flowContext: flowContext || null,
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

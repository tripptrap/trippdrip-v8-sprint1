// API Route: Send SMS via Telnyx with full tracking and analytics

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { spendPointsForAction } from '@/lib/pointsSupabaseServer';
import { sendTelnyxSMS } from '@/lib/telnyx';
import { checkSmsAllowed } from '@/lib/smsGuard';
import { moderateOutbound } from '@/lib/smsModeration';
import { resolveFromNumber, ownsNumber } from '@/lib/resolveFromNumber';

// Admin client to bypass RLS for phone number lookup
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SendSMSRequest {
  // Legacy support
  to?: string;
  from?: string;
  message?: string;
  isBulk?: boolean;

  // New parameters
  leadId?: string;
  campaignId?: string;
  toPhone?: string;
  messageBody?: string;
  templateId?: string;
  isAutomated?: boolean;
  channel?: 'sms' | 'rcs'; // Channel type
  mediaUrls?: string[]; // MMS media attachment URLs
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
    const fromPhone = body.from; // Validated for ownership below before it is trusted (#127)
    const { leadId, campaignId, templateId, isAutomated = false, isBulk = false, channel = 'sms', mediaUrls } = body;

    // Validate inputs
    if (!toPhone || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields: toPhone/to and messageBody/message' },
        { status: 400 }
      );
    }

    // Fetch user's opt-out keyword
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('opt_out_keyword')
      .eq('user_id', user.id)
      .single();

    const optOutKeyword = userSettings?.opt_out_keyword || 'STOP';

    // Check if this is the first message to this lead (no existing thread)
    const { data: existingThreadCheck } = await supabase
      .from('threads')
      .select('id')
      .eq('user_id', user.id)
      .eq('phone_number', toPhone)
      .eq('channel', channel)
      .single();

    const isFirstMessage = !existingThreadCheck;
    const messageToSend = isFirstMessage
      ? `${messageBody}\n\nReply ${optOutKeyword} to opt out`
      : messageBody;

    // Single gate for DNC, opt-out, account suspension and send rate (#121).
    //
    // This route hand-rolled the DNC check instead of using the shared guard,
    // and got it wrong in a way that mattered: on a `check_dnc` error it logged
    // and **carried on sending**. A transient failure of the opt-out lookup
    // meant messaging someone who may have texted STOP. The guard fails closed.
    //
    // Routing through it also picks up the two gates this path never had: a
    // suspended account can no longer send, and per-account rate caps now apply
    // here as they do everywhere else.
    //
    // Quiet hours stay off — a person pressing Send is a deliberate act, and
    // that is the established rule for manual sends (#50).
    const guard = await checkSmsAllowed(createServiceRoleClient(), user.id, toPhone, {
      context: { source: 'sms/send', campaign_id: campaignId, message_body: messageBody },
    });

    if (!guard.allowed) {
      console.log(`🚫 sms/send blocked — ${guard.reason}: ${guard.detail}`);
      return NextResponse.json(
        {
          error: guard.detail || 'Message blocked',
          reason: guard.reason,
          retryable: !!guard.retryable,
          on_dnc_list: guard.reason === 'dnc',
          list_type: guard.listType,
        },
        { status: guard.reason === 'rate_limited' ? 429 : 403 }
      );
    }

    // Content moderation (#123). This route sent user-authored text with no
    // spam check at all — `telnyx/send-sms` and `campaigns/run` had one and
    // nothing else did.
    //
    // Scores `messageBody`, the part the user wrote, not `messageToSend` — the
    // difference is our own mandatory opt-out footer, and "revise your message"
    // is useless advice when the flagged wording is text we appended.
    //
    // Placed before the points deduction below: blocking after spending a point
    // would charge for a message that never went out.
    const moderation = await moderateOutbound(createServiceRoleClient(), user.id, messageBody);
    if (!moderation.allowed) {
      console.log(`🚫 sms/send blocked by moderation — score ${moderation.spamScore}`);
      return NextResponse.json(
        {
          error: moderation.detail,
          spamRisk: true,
          spamScore: moderation.spamScore,
          detectedWords: moderation.flags,
          suggestions: moderation.suggestions,
        },
        { status: 400 }
      );
    }

    // Resolve the from-number: an explicit one wins, otherwise the shared
    // resolver (#122). This used to take whichever number was created first,
    // which ignored the primary flag as well as geo, locks and rests.
    //
    // Moved ABOVE the point deduction (#125). Failing to resolve a number used
    // to return 400 after a point had already been spent, with no refund — rare
    // while the only cause was owning no numbers, but a guaranteed way to burn
    // points once a temporary lookup failure became a reportable outcome.
    //
    // An explicit number short-circuits the resolver, so until #127 **nothing
    // validated it**. `phone_number` is globally unique, so an unowned value is
    // another tenant's number — sending from it attributes the traffic, and any
    // opt-out it earns, to them. `telnyx/send-sms` has had this check all along;
    // this route and ai-drip/start did not.
    let resolvedFrom = fromPhone;
    if (resolvedFrom && supabaseAdmin) {
      const owned = await ownsNumber(supabaseAdmin, user.id, resolvedFrom);
      if (!owned) {
        console.error('❌ sms/send with an unowned number:', { userId: user.id, from: resolvedFrom });
        return NextResponse.json(
          { error: 'You do not have permission to send from this phone number' },
          { status: 403 }
        );
      }
    }
    if (!resolvedFrom && supabaseAdmin) {
      const resolved = await resolveFromNumber(supabaseAdmin, user.id, { leadZipCode: null, toPhone });
      if (!resolved.ok) {
        return NextResponse.json(
          { error: resolved.detail, reason: resolved.reason, retryable: resolved.retryable },
          { status: resolved.retryable ? 503 : 400 }
        );
      }
      resolvedFrom = resolved.number;
    }

    if (!resolvedFrom) {
      return NextResponse.json(
        { error: 'No phone number available. Please claim a phone number first.' },
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

    console.log(`📤 Sending ${channel.toUpperCase()} to ${toPhone} from ${resolvedFrom} via Telnyx...`);

    // Send SMS via Telnyx (with opt-out footer if first message)
    const result = await sendTelnyxSMS({
      to: toPhone,
      message: messageToSend,
      from: resolvedFrom,
      mediaUrls: mediaUrls,
      moderation,
    });

    if (!result.success) {
      console.error('❌ SMS send failed:', result.error);

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

      // Checked, not fire-and-forget. supabase-js returns { error } rather than
      // throwing, so an unchecked insert fails in total silence — and a send that
      // records no row is a send no rate limit and no number-health figure can
      // see (#126).
      const { error: msgInsertError } = await supabase.from('messages').insert({
        thread_id: threadId,
        from_phone: actualFromPhone,
        to_phone: toPhone,
        content: messageBody,
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
        media_urls: mediaUrls || null,
        num_media: mediaUrls?.length || 0,
        // Recorded even when under the block threshold — an account that keeps
        // sending 25-scoring messages is a signal worth having (#123).
        spam_score: moderation.spamScore,
        spam_flags: moderation.flags,
      });

      if (msgInsertError) {
        console.error(`❌ Sent SMS to ${toPhone} but failed to record it:`, msgInsertError);
      }
    }

    // User takeover: pause any active drip enrollments for this lead
    if (leadId && !isAutomated) {
      try {
        const { data: paused } = await supabase
          .from('drip_campaign_enrollments')
          .update({ status: 'paused', paused_at: new Date().toISOString() })
          .eq('lead_id', leadId)
          .eq('status', 'active')
          .select('id');

        if (paused?.length) {
          console.log(`⏸️ Paused ${paused.length} drip enrollment(s) for lead ${leadId} — user takeover`);
        }
      } catch (err) {
        // Non-critical — don't fail the send
        console.error('Error pausing drip enrollments:', err);
      }
    }

    // Log activity for lead if leadId provided
    if (leadId) {
      await supabase.from('lead_activities').insert({
        user_id: user.id,
        lead_id: leadId,
        activity_type: 'sms_sent',
        title: 'SMS Sent',
        description: messageBody.substring(0, 100) + (messageBody.length > 100 ? '...' : ''),
        metadata: { toPhone, messageSid: result.messageSid },
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

// API Route: Send SMS via Telnyx
// This sends outbound SMS messages through the Telnyx API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { selectClosestNumber } from '@/lib/geo/selectClosestNumber';
import { detectSpam } from '@/lib/spam/detector';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    const { to, from, message, userId: passedUserId, threadId, mediaUrls, leadId, campaignId } = await req.json();

    // Get current user from session if userId not passed
    let userId = passedUserId;
    if (!userId) {
      try {
        const serverClient = await createServerClient();
        const { data: { user } } = await serverClient.auth.getUser();
        userId = user?.id;
      } catch (e) {
        console.log('Could not get user from session:', e);
      }
    }

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Telnyx API key not configured' },
        { status: 500 }
      );
    }

    if (!messagingProfileId) {
      return NextResponse.json(
        { error: 'Telnyx messaging profile ID not configured' },
        { status: 500 }
      );
    }

    // IMPORTANT: Validate that the user owns the "from" number
    // This prevents users from sending SMS from numbers they don't own
    if (from && userId && supabaseAdmin) {
      const { data: ownedNumber, error: ownershipError } = await supabaseAdmin
        .from('user_telnyx_numbers')
        .select('id')
        .eq('user_id', userId)
        .eq('phone_number', from)
        .eq('status', 'active')
        .single();

      if (ownershipError || !ownedNumber) {
        console.error('❌ User attempted to send from unowned number:', { userId, from });
        return NextResponse.json(
          { error: 'You do not have permission to send from this phone number' },
          { status: 403 }
        );
      }
    }

    // Geo-proximity routing: pick closest number when no explicit 'from' provided
    let resolvedFrom = from;
    if (!resolvedFrom && userId && supabaseAdmin) {
      let leadZipCode: string | null = null;

      // Look up lead zip code by leadId
      if (leadId) {
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('zip_code')
          .eq('id', leadId)
          .single();
        leadZipCode = lead?.zip_code || null;
      }

      // Fallback: look up lead by phone number
      if (!leadZipCode && !leadId) {
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('zip_code')
          .eq('user_id', userId)
          .eq('phone', to)
          .limit(1)
          .single();
        leadZipCode = lead?.zip_code || null;
      }

      resolvedFrom = await selectClosestNumber(userId, leadZipCode, supabaseAdmin);
      if (resolvedFrom) {
        console.log('📍 Geo-routed to number:', resolvedFrom, 'for zip:', leadZipCode);
      }
    }

    // Build request body
    const requestBody: any = {
      from: resolvedFrom || undefined, // If not provided, Telnyx will use number pool
      to: to,
      text: message,
      messaging_profile_id: messagingProfileId,
    };

    // Add media for MMS
    if (mediaUrls && mediaUrls.length > 0) {
      requestBody.media_urls = mediaUrls;
    }

    // Send via Telnyx API
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx API error:', data);
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || 'Failed to send message' },
        { status: response.status }
      );
    }

    console.log('✅ Telnyx SMS sent:', {
      to,
      from: data.data?.from?.phone_number,
      messageSid: data.data?.id,
    });

    // Save to database if we have user context
    if (supabaseAdmin && userId) {
      let finalThreadId = threadId;

      // Create or get thread - check by phone number OR lead_id
      if (!finalThreadId) {
        let existingThread = null;

        // First try by phone number
        const { data: threadByPhone } = await supabaseAdmin
          .from('threads')
          .select('id, messages_from_user, lead_id, campaign_id')
          .eq('user_id', userId)
          .eq('phone_number', to)
          .single();

        if (threadByPhone) {
          existingThread = threadByPhone;
        } else if (leadId) {
          // Try by lead_id
          const { data: threadByLead } = await supabaseAdmin
            .from('threads')
            .select('id, messages_from_user, lead_id, campaign_id')
            .eq('user_id', userId)
            .eq('lead_id', leadId)
            .single();

          if (threadByLead) {
            existingThread = threadByLead;
            // Update phone_number on existing thread
            await supabaseAdmin
              .from('threads')
              .update({ phone_number: to })
              .eq('id', threadByLead.id);
          }
        }

        if (existingThread) {
          finalThreadId = existingThread.id;
          const updateData: any = {
            last_message: message,
            updated_at: new Date().toISOString(),
            messages_from_user: (existingThread.messages_from_user || 0) + 1,
          };
          // Set campaign_id if provided and thread doesn't have one yet
          if (campaignId && !existingThread.campaign_id) {
            updateData.campaign_id = campaignId;
          }
          await supabaseAdmin
            .from('threads')
            .update(updateData)
            .eq('id', finalThreadId);
        } else {
          const { data: newThread } = await supabaseAdmin
            .from('threads')
            .insert({
              user_id: userId,
              phone_number: to,
              lead_id: leadId || null,
              campaign_id: campaignId || null, // Set campaign_id for new threads
              channel: 'sms',
              status: 'active',
              last_message: message,
              messages_from_lead: 0,
              messages_from_user: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          finalThreadId = newThread?.id;
        }
      }

      // Save the message with spam score
      if (finalThreadId) {
        console.log('💾 Saving message to thread:', finalThreadId);
        const spamResult = detectSpam(message);
        const spamFlags = spamResult.detectedWords.map(w => w.word);
        const { error: insertError } = await supabaseAdmin.from('messages').insert({
          user_id: userId, // Required for RLS
          thread_id: finalThreadId,
          from_phone: data.data?.from?.phone_number || from,
          to_phone: to,
          body: message,
          content: message, // content column has NOT NULL constraint
          direction: 'outbound',
          status: 'sent',
          message_sid: data.data?.id,
          num_media: mediaUrls?.length || 0,
          media_urls: mediaUrls?.length > 0 ? mediaUrls : null,
          channel: mediaUrls?.length > 0 ? 'mms' : 'sms',
          provider: 'telnyx',
          spam_score: spamResult.spamScore,
          spam_flags: spamFlags,
          created_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('❌ Error saving message:', insertError);
        } else {
          console.log('✅ Message saved successfully');
        }
      } else {
        console.error('❌ No thread ID, message not saved');
      }
    } else {
      console.log('⚠️ No supabaseAdmin or userId, message not saved to DB');
    }

    return NextResponse.json({
      success: true,
      messageId: data.data?.id,
      from: data.data?.from?.phone_number,
      to: data.data?.to?.[0]?.phone_number,
      status: data.data?.to?.[0]?.status,
    });

  } catch (error: any) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}

// API Route: Start AI Drip
// Creates a new AI drip with pre-generated follow-up messages

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { spendPointsForAction } from '@/lib/pointsSupabaseServer';

// STRICT RULE: No messages after 9pm EST - push to next day at 9am EST
function adjustForQuietHours(date: Date): Date {
  // Convert to EST (UTC-5)
  const estOffset = -5 * 60; // EST is UTC-5
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
  const estDate = new Date(utcTime + (estOffset * 60000));

  const estHour = estDate.getHours();

  // If after 9pm (21:00) EST or before 9am EST, push to 9am next day
  if (estHour >= 21 || estHour < 9) {
    // Calculate next 9am EST
    const nextDay = new Date(date);
    if (estHour >= 21) {
      // After 9pm - move to next day
      nextDay.setDate(nextDay.getDate() + 1);
    }
    // Set to 9am EST (14:00 UTC)
    nextDay.setUTCHours(14, 0, 0, 0);
    return nextDay;
  }

  return date;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { threadId, phoneNumber, fromNumber, intervalHours = 6, maxMessages = 5, maxDurationHours = 72 } = await req.json();

    if (!threadId || !phoneNumber) {
      return NextResponse.json({ success: false, error: 'Thread ID and phone number required' }, { status: 400 });
    }

    // Check if there's already an active drip for this thread
    const { data: existingDrip } = await supabase
      .from('ai_drips')
      .select('id')
      .eq('thread_id', threadId)
      .eq('status', 'active')
      .single();

    if (existingDrip) {
      return NextResponse.json({
        success: false,
        error: 'An active drip already exists for this conversation',
        existingDripId: existingDrip.id
      }, { status: 409 });
    }

    // Get conversation history for AI context
    const { data: messages } = await supabase
      .from('messages')
      .select('body, content, direction, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationText = (messages || [])
      .reverse()
      .map(m => `${m.direction === 'inbound' || m.direction === 'in' ? 'Customer' : 'Agent'}: ${m.body || m.content || ''}`)
      .join('\n');

    // Calculate times
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + maxDurationHours);

    const actualMaxMessages = maxMessages || 5;

    // Check and deduct points BEFORE making AI request (2 points for AI response)
    const pointsResult = await spendPointsForAction('ai_response', 1);

    if (!pointsResult.success) {
      console.log('Points check failed:', pointsResult.error);
      return NextResponse.json({
        success: false,
        error: pointsResult.error || 'Insufficient points. You need 2 points for AI drip.',
        pointsNeeded: 2
      }, { status: 402 });
    }

    console.log('Points deducted, generating AI messages...');

    // Generate all follow-up messages using AI - DIRECTLY call OpenAI
    const aiPrompt = `You are a helpful sales agent creating a follow-up sequence for a customer who hasn't responded.

Recent conversation:
${conversationText || 'No previous conversation'}

Generate exactly ${actualMaxMessages} unique follow-up messages, each on a new line. Each message should:
- Be brief (under 160 characters for SMS)
- Be friendly but professional
- Vary in approach (first one gentle, later ones more urgent)
- Include a question or call-to-action
- NOT repeat previous messages

Format: Just the messages, one per line, no numbering.`;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: aiPrompt }]
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Failed to generate follow-up messages'
      }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const aiReply = aiData.choices?.[0]?.message?.content ?? '';

    if (!aiReply) {
      return NextResponse.json({
        success: false,
        error: 'AI returned empty response'
      }, { status: 500 });
    }

    console.log('AI generated messages successfully');

    // Parse generated messages
    const generatedMessages = aiReply
      .split('\n')
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0 && m.length <= 320)
      .slice(0, actualMaxMessages);

    if (generatedMessages.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate valid follow-up messages'
      }, { status: 500 });
    }

    // Create the drip - apply quiet hours rule
    let firstSendAt = new Date();
    firstSendAt.setHours(firstSendAt.getHours() + intervalHours);
    firstSendAt = adjustForQuietHours(firstSendAt);

    const { data: drip, error: insertError } = await supabase
      .from('ai_drips')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        phone_number: phoneNumber,
        from_number: fromNumber,
        status: 'active',
        interval_hours: intervalHours,
        max_messages: generatedMessages.length,
        messages_sent: 0,
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        next_send_at: firstSendAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating AI drip:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // Create scheduled messages with quiet hours enforcement
    // Each message must be scheduled after the previous one, respecting quiet hours
    let lastScheduledTime = new Date();
    const scheduledMessages = generatedMessages.map((content: string, index: number) => {
      // Add interval from the last scheduled time (not from now)
      const scheduledFor = new Date(lastScheduledTime);
      scheduledFor.setHours(scheduledFor.getHours() + intervalHours);

      // Apply quiet hours rule - may push to next day
      const adjustedTime = adjustForQuietHours(scheduledFor);

      // Update last scheduled time for next message calculation
      lastScheduledTime = adjustedTime;

      return {
        drip_id: drip.id,
        user_id: user.id,
        message_number: index + 1,
        content,
        scheduled_for: adjustedTime.toISOString(),
        status: 'scheduled',
      };
    });

    const { data: insertedMessages, error: messagesError } = await supabase
      .from('ai_drip_messages')
      .insert(scheduledMessages)
      .select();

    if (messagesError) {
      console.error('Error creating drip messages:', messagesError);
      // Don't fail - drip is created, just no pre-generated messages
    }

    console.log('✅ AI Drip started with', generatedMessages.length, 'pre-generated messages:', {
      dripId: drip.id,
      threadId,
      phoneNumber,
      intervalHours,
    });

    return NextResponse.json({
      success: true,
      drip: {
        id: drip.id,
        status: drip.status,
        intervalHours: drip.interval_hours,
        maxMessages: drip.max_messages,
        messagesSent: drip.messages_sent,
        nextSendAt: drip.next_send_at,
        expiresAt: drip.expires_at,
      },
      scheduledMessages: (insertedMessages || []).map(m => ({
        id: m.id,
        messageNumber: m.message_number,
        content: m.content,
        scheduledFor: m.scheduled_for,
        status: m.status,
      })),
    });

  } catch (error: any) {
    console.error('Error starting AI drip:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveFromNumber } from '@/lib/resolveFromNumber';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, phoneNumber, fromNumber, intervalHours = 6, maxMessages = 5, maxDurationHours = 72 } = body;

    if (!threadId || !phoneNumber) {
      return NextResponse.json({ success: false, error: 'threadId and phoneNumber are required' }, { status: 400 });
    }

    // Check if there's already an active drip for this thread
    const { data: existingDrip } = await supabase
      .from('ai_drips')
      .select('id')
      .eq('thread_id', threadId)
      .eq('status', 'active')
      .single();

    if (existingDrip) {
      return NextResponse.json({ success: false, error: 'A drip is already active for this thread' }, { status: 409 });
    }

    // Number is chosen ONCE, here, and pinned to the drip (#122).
    //
    // process-ai-drips deliberately reuses `drip.from_number` for every step
    // rather than resolving per message: an AI drip is one continuing
    // conversation with one lead, and switching numbers mid-thread breaks
    // threading on the handset and reads as a different sender. So the geo
    // decision belongs at the start — which is what this now does, instead of
    // taking the primary and ignoring where the lead actually is.
    let senderNumber = fromNumber;
    if (!senderNumber) {
      const { data: lead } = await supabase
        .from('leads')
        .select('zip_code')
        .eq('user_id', user.id)
        .eq('phone', phoneNumber)
        .maybeSingle();
      const resolved = await resolveFromNumber(createServiceRoleClient(), user.id, {
        leadZipCode: lead?.zip_code ?? null,
      });
      if (!resolved.ok) {
        return NextResponse.json(
          { success: false, error: resolved.detail, reason: resolved.reason, retryable: resolved.retryable },
          { status: resolved.retryable ? 503 : 400 }
        );
      }
      senderNumber = resolved.number;
    }

    if (!senderNumber) {
      return NextResponse.json({ success: false, error: 'No sending number configured' }, { status: 400 });
    }

    // Check user has enough credits (2 points per message minimum)
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    const estimatedCost = (maxMessages || 5) * 2;
    if ((userData?.credits || 0) < estimatedCost) {
      return NextResponse.json({
        success: false,
        error: `Insufficient credits. Need at least ${estimatedCost} credits for ${maxMessages || 5} messages.`
      }, { status: 402 });
    }

    // Calculate expiration and first send time
    const now = new Date();
    const expiresAt = new Date(now.getTime() + maxDurationHours * 60 * 60 * 1000);
    const nextSendAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

    // Create the drip
    const { data: drip, error: createError } = await supabase
      .from('ai_drips')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        phone_number: phoneNumber,
        from_number: senderNumber,
        status: 'active',
        interval_hours: intervalHours,
        max_messages: maxMessages || null,
        messages_sent: 0,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        next_send_at: nextSendAt.toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating AI drip:', createError);
      return NextResponse.json({ success: false, error: createError.message }, { status: 500 });
    }

    // Calculate time until next send for display
    const hoursUntilNext = Math.round((nextSendAt.getTime() - now.getTime()) / (1000 * 60 * 60));

    return NextResponse.json({
      success: true,
      drip: {
        id: drip.id,
        status: drip.status,
        intervalHours: drip.interval_hours,
        maxMessages: drip.max_messages,
        messagesSent: drip.messages_sent,
        startedAt: drip.started_at,
        expiresAt: drip.expires_at,
        nextSendAt: drip.next_send_at,
        timeUntilNext: `${hoursUntilNext}h`,
        lastError: null,
      },
    });

  } catch (error: any) {
    console.error('AI drip start error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

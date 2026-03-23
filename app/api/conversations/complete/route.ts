// API Route: Mark a conversation session as completed
// Handles flow completion logging, auto-tagging, and lead status updates

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { completeSession, trackLeadActivity } from '@/lib/conversations/sessionManager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const {
      sessionId,
      completionType = 'full', // 'full' | 'partial' | 'cancelled'
      appointmentBooked = false,
      appointmentTime,
      googleEventId,
      autoTag, // optional tag to apply on completion (e.g., 'appointment set')
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Fetch the session to get flow and lead info
    const { data: session, error: sessionError } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Session is already completed' }, { status: 409 });
    }

    // 1. Mark session as completed
    const completionResult = await completeSession(
      user.id,
      sessionId,
      appointmentBooked,
      appointmentTime,
      googleEventId
    );

    if (!completionResult.success) {
      return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 });
    }

    // 2. Log to flow_completion_log
    const questionsAnswered = session.questions_answered || 0;
    const questionsTotal = session.questions_total || 0;

    await supabase.from('flow_completion_log').insert({
      user_id: user.id,
      lead_id: session.lead_id,
      flow_id: session.flow_id,
      campaign_id: session.campaign_id || null,
      steps_completed: questionsAnswered,
      total_steps: questionsTotal,
      completion_type: completionType,
      completed_at: new Date().toISOString(),
    });

    // 3. Track lead activity
    if (session.lead_id) {
      const activityType = appointmentBooked ? 'appointment_scheduled' : 'conversation_completed';
      const description = appointmentBooked
        ? `Flow completed with appointment booked${appointmentTime ? ` for ${new Date(appointmentTime).toLocaleString()}` : ''}`
        : `Conversation flow completed (${completionType})`;

      await trackLeadActivity(user.id, session.lead_id, activityType, description, {
        sessionId,
        flowId: session.flow_id,
        completionType,
        appointmentBooked,
        questionsAnswered,
        questionsTotal,
      });

      // 4. Auto-tag lead on completion
      if (autoTag || appointmentBooked) {
        const tagToApply = autoTag || 'appointment set';

        const { data: lead } = await supabase
          .from('leads')
          .select('tags, primary_tag')
          .eq('id', session.lead_id)
          .eq('user_id', user.id)
          .single();

        if (lead) {
          const currentTags: string[] = lead.tags || [];
          const updatedTags = [...new Set([...currentTags, tagToApply])];

          await supabase
            .from('leads')
            .update({
              tags: updatedTags,
              primary_tag: tagToApply,
              status: appointmentBooked ? 'appointment_set' : lead.primary_tag ? undefined : 'qualified',
              qualified_at: completionType === 'full' ? new Date().toISOString() : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.lead_id)
            .eq('user_id', user.id);
        }
      }

      // 5. Update lead appointment fields if booked
      if (appointmentBooked) {
        const appointmentUpdates: any = {
          appointment_scheduled: true,
          updated_at: new Date().toISOString(),
        };
        if (appointmentTime) appointmentUpdates.appointment_at = appointmentTime;
        if (googleEventId) appointmentUpdates.appointment_google_event_id = googleEventId;

        await supabase
          .from('leads')
          .update(appointmentUpdates)
          .eq('id', session.lead_id)
          .eq('user_id', user.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Session completed successfully',
      completionType,
      appointmentBooked,
      sessionId,
    });

  } catch (error: any) {
    console.error('Error completing conversation session:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

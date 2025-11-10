import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/conversations/recover?sessionId=xxx
 * Recover an abandoned conversation session
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'Session ID required' }, { status: 400 });
    }

    // Get session
    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .select('*, leads(*)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }

    // Check if session can be recovered (not completed, not too old)
    const lastActivity = new Date(session.last_activity_at);
    const now = new Date();
    const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

    if (session.status === 'completed') {
      return NextResponse.json({
        ok: false,
        error: 'Session already completed',
        canRecover: false
      }, { status: 400 });
    }

    // Allow recovery up to 7 days
    if (hoursSinceLastActivity > 168) {
      return NextResponse.json({
        ok: false,
        error: 'Session too old to recover',
        canRecover: false
      }, { status: 400 });
    }

    // Update session status
    const { data: updatedSession, error: updateError } = await supabase
      .from('conversation_sessions')
      .update({
        status: 'recovered',
        recovered_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating session:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Create activity record
    if (session.lead_id) {
      await supabase
        .from('lead_activities')
        .insert({
          user_id: user.id,
          lead_id: session.lead_id,
          activity_type: 'conversation_recovered',
          description: 'Conversation session was recovered',
          metadata: {
            session_id: sessionId,
            hours_since_last_activity: hoursSinceLastActivity
          }
        });
    }

    return NextResponse.json({
      ok: true,
      session: updatedSession,
      canRecover: true,
      message: 'Session recovered successfully'
    });
  } catch (error: any) {
    console.error('Error in GET /api/conversations/recover:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/conversations/recover/link
 * Generate a recovery link for an abandoned session
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'Session ID required' }, { status: 400 });
    }

    // Get session
    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }

    // Update session to mark recovery link sent
    await supabase
      .from('conversation_sessions')
      .update({
        recovery_link_sent: true,
        recovery_link_sent_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    // Generate recovery link
    const recoveryLink = `${process.env.NEXT_PUBLIC_APP_URL}/recover?sessionId=${sessionId}`;

    return NextResponse.json({
      ok: true,
      recoveryLink,
      message: 'Recovery link generated'
    });
  } catch (error: any) {
    console.error('Error in POST /api/conversations/recover/link:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

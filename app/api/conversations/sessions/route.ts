import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/conversations/sessions
 * Get all conversation sessions for the current user
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
    const status = searchParams.get('status');
    const leadId = searchParams.get('leadId');

    // Build query
    let query = supabase
      .from('conversation_sessions')
      .select('*, leads(*)')
      .eq('user_id', user.id)
      .order('last_activity_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sessions });
  } catch (error: any) {
    console.error('Error in GET /api/conversations/sessions:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/conversations/sessions
 * Create a new conversation session
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
    const { flowId, leadId, collectedInfo } = body;

    // Create session
    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .insert({
        user_id: user.id,
        flow_id: flowId,
        lead_id: leadId,
        status: 'active',
        collected_info: collectedInfo || {},
        conversation_history: [],
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (error: any) {
    console.error('Error in POST /api/conversations/sessions:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/conversations/sessions
 * Update an existing conversation session
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, updates } = body;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'Session ID required' }, { status: 400 });
    }

    // Update session
    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .update({
        ...updates,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating session:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (error: any) {
    console.error('Error in PUT /api/conversations/sessions:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

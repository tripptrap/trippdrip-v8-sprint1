/**
 * POST /api/demo/conversation
 *
 * Demo mode: run one message through the EXACT same pipeline as production.
 *   1. extractFlowAnswers  — pull field values out of the message
 *   2. build flowContext    — same object the webhook passes to the AI
 *   3. generateReceptionistResponse — identical AI call used in prod
 *
 * Session state (collectedInfo, conversationHistory) lives on the client
 * so this route is completely stateless and never touches the leads table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractFlowAnswers } from '@/lib/ai/extractFlowAnswers';
import { generateReceptionistResponse } from '@/lib/receptionist/generateResponse';
import type { FlowContext } from '@/lib/receptionist/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const {
      flowId,
      message,
      collectedInfo = {},
      conversationHistory = [],  // [{ direction: 'inbound'|'outbound', body: string }]
    } = await req.json();

    if (!flowId || !message?.trim()) {
      return NextResponse.json({ ok: false, error: 'flowId and message are required' }, { status: 400 });
    }

    // ── 1. Load the flow ──────────────────────────────────────────────────────
    const { data: flow, error: flowError } = await supabase
      .from('conversation_flows')
      .select('id, name, required_questions, context, steps')
      .eq('id', flowId)
      .eq('user_id', user.id)
      .single();

    if (flowError || !flow) {
      return NextResponse.json({ ok: false, error: 'Flow not found' }, { status: 404 });
    }

    const requiredQuestions: Array<{ question: string; fieldName: string }> =
      flow.required_questions || [];

    // ── 2. Extract answers from the message (same as production webhook) ──────
    const remaining = requiredQuestions.filter(q => !collectedInfo[q.fieldName]);
    let extracted: Record<string, string> = {};
    if (remaining.length > 0 && message.trim()) {
      extracted = await extractFlowAnswers(message, remaining, collectedInfo);
    }
    const updatedCollected: Record<string, string> = { ...collectedInfo, ...extracted };
    const updatedRemaining = requiredQuestions.filter(q => !updatedCollected[q.fieldName]);
    const allAnswered = requiredQuestions.length > 0 && updatedRemaining.length === 0;

    // ── 3. Build flowContext (identical to production webhook) ─────────────────
    const flowContext: FlowContext = {
      flowName: flow.name,
      requiredQuestions,
      collectedInfo: updatedCollected,
      remainingQuestions: updatedRemaining,
      allAnswered,
    };

    // ── 4. Load receptionist settings (or use sensible demo defaults) ─────────
    const { data: settings } = await supabase
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const demoSettings = settings || {
      id: 'demo',
      user_id: user.id,
      enabled: true,
      system_prompt: flow.context?.whoYouAre || null,
      greeting_message: null,
      industry: null,
      use_industry_preset: false,
      business_hours_enabled: false,   // never block on hours in demo
      business_hours_start: '00:00:00',
      business_hours_end: '23:59:59',
      business_hours_timezone: 'America/New_York',
      business_days: [1, 2, 3, 4, 5, 6, 7],
      after_hours_message: null,
      respond_to_sold_clients: true,
      respond_to_new_contacts: true,
      auto_create_leads: false,
      calendar_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // ── 5. Generate AI response (exact same function as production) ───────────
    const updatedHistory = [
      ...conversationHistory,
      { direction: 'inbound', body: message },
    ];

    const result = await generateReceptionistResponse(
      {
        userId: user.id,
        threadId: 'demo',
        phoneNumber: '+15550000000',
        inboundMessage: message,
        contactType: 'existing_lead',
        leadId: null,
        leadName: 'Demo Lead',
        conversationHistory: updatedHistory,
        flowContext,
      },
      demoSettings as any
    );

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    // ── 6. Determine pipeline tag change ─────────────────────────────────────
    const pipelineTag = allAnswered ? 'qualified' : null;

    return NextResponse.json({
      ok: true,
      aiResponse: result.response,
      responseType: result.responseType,
      extracted,                       // only the newly-extracted fields this turn
      updatedCollectedInfo: updatedCollected,
      remainingQuestions: updatedRemaining,
      totalRequired: requiredQuestions.length,
      answeredCount: Object.keys(updatedCollected).length,
      allAnswered,
      pipelineTag,                     // tag that would be applied in production
    });

  } catch (err: any) {
    console.error('Demo conversation error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

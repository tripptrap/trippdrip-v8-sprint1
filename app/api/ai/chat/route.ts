// API Route: conversational AI assistant for the browser extension
//
// The extension has always called this path (browser-extension/popup.js:498) and
// it has never existed — `app/api/ai/` had route.ts, compose, smart-replies,
// analyze-sentiment, generate-follow-up and spam-check, and nothing else. Every
// chat message 404'd, so the popup silently fell back to a canned reply from
// generateFallbackResponse() and the user could not tell the AI was never
// consulted (#147).
//
// The contract is fixed by the caller, which is already shipped:
//   request   { message, context, history: [{ role, content }] }
//   response  { response: string, tokens?: number }
// It reads `data.response` and adds `data.tokens` to a running counter.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { authenticateRequest } from '@/lib/apiAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 2 points, the same as every other model-backed call (POINT_COSTS.ai_response). */
const AI_CHAT_COST = 2;

// Lazily constructed: `new OpenAI({ apiKey })` throws when the key is absent, and
// at module scope that runs during Next's build-time page-data collection, which
// breaks the build in any environment without OPENAI_API_KEY.
let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  return client;
}

export async function POST(req: NextRequest) {
  try {
    // Session OR Bearer — the extension has no cookies. See lib/apiAuth.ts.
    const caller = await authenticateRequest(req);
    if (!caller) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { message, context, history } = await req.json();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      // Explicit, so this does not read as a model failure. The extension falls
      // back to canned text on any non-2xx, which is the right behaviour here.
      return NextResponse.json({ error: 'AI is not configured' }, { status: 503 });
    }

    // Only the last 10 turns are sent by the extension; trust nothing about the
    // shape and keep just what the API accepts.
    const priorTurns = Array.isArray(history)
      ? history
          .filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
          .slice(-10)
          .map((m: any) => ({
            role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(m.content).slice(0, 4000),
          }))
      : [];

    const completion = await openai().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a sales assistant inside the HyveWyre browser extension. Help the user work the lead in front of them: draft outreach, suggest next steps, and answer questions about the conversation. Be concise — replies are read in a small popup. Never invent details about the lead that you were not given. Do not make promises on the user\'s behalf, and do not give legal, medical or financial advice.' +
            (context ? `\n\n${String(context).slice(0, 2000)}` : ''),
        },
        ...priorTurns,
        { role: 'user', content: message.slice(0, 4000) },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) {
      // Nothing generated, so nothing to charge for.
      return NextResponse.json({ error: 'No response generated' }, { status: 502 });
    }

    // Charge only once there is an answer to charge for, and by the verified
    // caller id — spendPoints() resolves the user from cookies, which a Bearer
    // caller does not have. deduct_credits is service-role-only and writes its
    // own points_transactions row (#137), so no ledger insert here.
    const { error: chargeError } = await createServiceRoleClient().rpc('deduct_credits', {
      user_id: caller.id,
      amount: AI_CHAT_COST,
      reason: 'Extension AI chat',
    });

    if (chargeError) {
      // 23514 is the function's insufficient-credits / unknown-user case.
      if (chargeError.code === '23514' || /insufficient/i.test(chargeError.message || '')) {
        return NextResponse.json(
          { error: 'Insufficient points', insufficientPoints: true },
          { status: 402 }
        );
      }
      console.error('AI chat: could not charge:', chargeError);
      return NextResponse.json({ error: 'Could not process credits' }, { status: 500 });
    }

    return NextResponse.json({
      response: answer,
      tokens: completion.usage?.total_tokens ?? 0,
      pointsUsed: AI_CHAT_COST,
    });
  } catch (error: any) {
    console.error('AI chat error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

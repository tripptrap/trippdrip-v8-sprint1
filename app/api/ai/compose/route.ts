// API Route: Context-aware AI message composition
// Provides intelligent message drafting with lead context, conversation history,
// multiple suggestions, and tone options

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { spendPointsForAction } from '@/lib/pointsSupabaseServer';

export const dynamic = 'force-dynamic';

// MED-8: Per-user burst rate limiter — 20 AI compose requests per minute
// Prevents script loops from draining OpenAI budget before credits run out
const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60 * 1000;
const aiRateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkAIRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = aiRateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) {
    aiRateLimitMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true, remaining: AI_RATE_LIMIT - 1 };
  }
  if (entry.count >= AI_RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: AI_RATE_LIMIT - entry.count };
}

interface ComposeRequest {
  message?: string; // User's draft (optional for 'generate' mode)
  mode: 'improve' | 'rewrite' | 'generate' | 'shorten';
  leadId?: string;
  threadId?: string;
  tone?: 'professional' | 'casual' | 'friendly' | 'urgent';
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // MED-8: Burst rate limit check
    const rateCheck = checkAIRateLimit(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({
        ok: false,
        error: `Rate limit exceeded: maximum ${AI_RATE_LIMIT} AI compose requests per minute. Please wait a moment.`,
        rateLimited: true
      }, { status: 429 });
    }

    const body: ComposeRequest = await req.json();
    const { message, mode = 'improve', leadId, threadId, tone = 'professional' } = body;

    if (mode !== 'generate' && !message?.trim()) {
      return NextResponse.json({ ok: false, error: 'Message is required for this mode' }, { status: 400 });
    }

    // Deduct points (2 for AI compose)
    const pointsResult = await spendPointsForAction('ai_response', 1);
    if (!pointsResult.success) {
      return NextResponse.json({
        ok: false,
        error: pointsResult.error || 'Insufficient points. You need 2 points for AI compose.',
        pointsNeeded: 2,
      }, { status: 402 });
    }

    // Gather lead context if available
    let leadContext = '';
    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, status, disposition, tags, source, temperature, notes')
        .eq('id', leadId)
        .eq('user_id', user.id)
        .single();

      if (lead) {
        leadContext = `\nLEAD CONTEXT:
- Name: ${lead.first_name || ''} ${lead.last_name || ''}
- Status: ${lead.status || 'unknown'}
- Temperature: ${lead.temperature || 'unknown'}
- Tags: ${(lead.tags || []).join(', ') || 'none'}
- Source: ${lead.source || 'unknown'}
${lead.notes ? `- Notes: ${lead.notes.substring(0, 200)}` : ''}`;
      }
    }

    // Gather conversation history if available
    let conversationContext = '';
    if (threadId) {
      const { data: messages } = await supabase
        .from('messages')
        .select('direction, body, created_at')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (messages && messages.length > 0) {
        const history = messages.reverse().map(m =>
          `${m.direction === 'inbound' ? 'Lead' : 'You'}: ${m.body}`
        ).join('\n');
        conversationContext = `\nRECENT CONVERSATION:\n${history}`;
      }
    }

    // Build the system prompt based on mode
    const toneInstructions: Record<string, string> = {
      professional: 'Use a professional, business-appropriate tone.',
      casual: 'Use a casual, conversational tone. Be approachable.',
      friendly: 'Use a warm, friendly tone. Be personable and engaging.',
      urgent: 'Convey urgency without being pushy. Create a sense of importance.',
    };

    let systemPrompt = `You are an expert SMS copywriter. Write messages optimized for SMS delivery.
${toneInstructions[tone] || toneInstructions.professional}
${leadContext}
${conversationContext}

SMS RULES:
- Keep messages under 160 characters when possible (max 320)
- Use natural, conversational language
- No hashtags, emojis overuse, or spam-trigger words (FREE, ACT NOW, LIMITED TIME, etc.)
- Include a clear next step or call-to-action when appropriate
- Personalize based on available lead context`;

    let userPrompt = '';

    switch (mode) {
      case 'improve':
        userPrompt = `Improve this SMS message to be more effective while keeping the same intent. Return ONLY the improved message, then on a new line "---", then 2 alternative versions separated by "---".\n\nOriginal: ${message}`;
        break;
      case 'rewrite':
        userPrompt = `Completely rewrite this SMS message with a ${tone} tone. Return ONLY the rewritten message, then on a new line "---", then 2 alternative versions separated by "---".\n\nOriginal: ${message}`;
        break;
      case 'generate':
        userPrompt = `Generate an SMS message for this lead based on the context above. Return ONLY the message, then on a new line "---", then 2 alternative versions separated by "---".${message ? `\n\nAdditional guidance: ${message}` : ''}`;
        break;
      case 'shorten':
        userPrompt = `Shorten this SMS message to under 160 characters while keeping the key information. Return ONLY the shortened message, then on a new line "---", then 2 alternative versions separated by "---".\n\nOriginal: ${message}`;
        break;
    }

    // Call OpenAI
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('OpenAI error:', errorText);
      return NextResponse.json({ ok: false, error: 'AI generation failed' }, { status: 500 });
    }

    const data = await res.json();
    const rawResponse = data.choices?.[0]?.message?.content?.trim() || '';

    // Parse response into primary + alternatives
    const parts = rawResponse.split('---').map((s: string) => s.trim()).filter(Boolean);
    const primary = parts[0] || rawResponse;
    const alternatives = parts.slice(1);

    return NextResponse.json({
      ok: true,
      primary,
      alternatives,
      mode,
      tone,
      characterCount: primary.length,
      segments: Math.ceil(primary.length / 160),
      pointsUsed: 2,
      remainingBalance: pointsResult.balance,
    });

  } catch (error: any) {
    console.error('Error in /api/ai/compose:', error);
    return NextResponse.json({ ok: false, error: error.message || 'An unexpected error occurred' }, { status: 500 });
  }
}

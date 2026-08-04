import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeSpamContent, getSpamFreeRewritePrompt } from '@/lib/ai/spam-detection';
import OpenAI from 'openai';

// Constructed lazily, not at module scope.
//
// `new OpenAI({ apiKey })` throws when the key is missing, and at module scope
// that runs during Next's build-time page-data collection — so the whole app
// failed to build in any environment without OPENAI_API_KEY. That is what broke
// the first preview deployment, and it would break a fresh clone too.
//
// Same shape as lib/ai/openai.ts, which already did this correctly. The cost of
// a missing key should be that this one route fails at request time with a clear
// error, not that nothing builds.
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return openaiClient;
}

/**
 * POST /api/ai/spam-check
 * Analyzes a message for spam triggers and optionally rewrites it
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, rewrite = false } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Analyze the message for spam content
    const analysis = analyzeSpamContent(message);

    // If no rewrite requested, just return the analysis
    if (!rewrite) {
      return NextResponse.json({
        success: true,
        analysis,
        rewrittenMessage: null,
      });
    }

    // If rewrite requested and there are spam words, use AI to rewrite
    if (analysis.spamWords.length === 0 && analysis.patterns.length === 0) {
      return NextResponse.json({
        success: true,
        analysis,
        rewrittenMessage: message, // No changes needed
      });
    }

    // Check user's credits balance for AI usage
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    const pointsCost = 2;
    if (!userData || userData.credits < pointsCost) {
      return NextResponse.json(
        { error: 'Insufficient credits for AI rewrite', pointsRequired: pointsCost },
        { status: 402 }
      );
    }

    // Generate AI rewrite
    const prompt = getSpamFreeRewritePrompt(message, analysis.spamWords);

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SMS copywriter who specializes in writing messages that avoid spam filters while maintaining natural, authentic communication.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const rewrittenMessage = completion.choices[0]?.message?.content?.trim() || message;

    // Deduct credits
    await supabase
      .from('users')
      .update({ credits: userData.credits - pointsCost })
      .eq('id', user.id);

    // Analyze the rewritten message to confirm improvement
    const newAnalysis = analyzeSpamContent(rewrittenMessage);

    return NextResponse.json({
      success: true,
      analysis,
      rewrittenMessage,
      newAnalysis,
      pointsUsed: pointsCost,
      remainingCredits: userData.credits - pointsCost,
    });
  } catch (error) {
    console.error('Spam check error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze message' },
      { status: 500 }
    );
  }
}

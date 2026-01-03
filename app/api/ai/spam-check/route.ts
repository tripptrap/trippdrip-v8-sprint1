import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeSpamContent, getSpamFreeRewritePrompt } from '@/lib/ai/spam-detection';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // Check user's points balance for AI usage
    const { data: profile } = await supabase
      .from('profiles')
      .select('points_balance')
      .eq('id', user.id)
      .single();

    const pointsCost = 2;
    if (!profile || profile.points_balance < pointsCost) {
      return NextResponse.json(
        { error: 'Insufficient points for AI rewrite', pointsRequired: pointsCost },
        { status: 402 }
      );
    }

    // Generate AI rewrite
    const prompt = getSpamFreeRewritePrompt(message, analysis.spamWords);

    const completion = await openai.chat.completions.create({
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

    // Deduct points
    await supabase
      .from('profiles')
      .update({ points_balance: profile.points_balance - pointsCost })
      .eq('id', user.id);

    // Analyze the rewritten message to confirm improvement
    const newAnalysis = analyzeSpamContent(rewrittenMessage);

    return NextResponse.json({
      success: true,
      analysis,
      rewrittenMessage,
      newAnalysis,
      pointsUsed: pointsCost,
      remainingPoints: profile.points_balance - pointsCost,
    });
  } catch (error) {
    console.error('Spam check error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze message' },
      { status: 500 }
    );
  }
}

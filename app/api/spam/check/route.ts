import { NextRequest, NextResponse } from 'next/server';
import { detectSpam, cleanMessage, analyzeMessageQuality, getSpamPreventionTips } from '@/lib/spam/detector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { message, autoClean } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Detect spam words
    const spamResult = detectSpam(message);

    // Analyze overall message quality
    const qualityAnalysis = analyzeMessageQuality(message);

    // Generate cleaned version if requested
    let cleanedMessage = undefined;
    if (autoClean) {
      cleanedMessage = cleanMessage(message);
    }

    // Get prevention tips
    const tips = getSpamPreventionTips();

    return NextResponse.json({
      ok: true,
      original: message,
      spamDetection: spamResult,
      quality: qualityAnalysis,
      cleanedMessage,
      tips,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Error in spam check:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check spam' },
      { status: 500 }
    );
  }
}

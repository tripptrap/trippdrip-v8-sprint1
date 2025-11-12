import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeLeadSentiment } from '@/lib/ai/openai';
import { spendPoints } from '@/lib/pointsSupabaseServer';

export const dynamic = "force-dynamic";

/**
 * AI Sentiment Analysis - Analyze lead engagement and sentiment
 * POST /api/ai/analyze-sentiment
 * Cost: 2 points per request
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Check and deduct points before analyzing sentiment
    const pointsResult = await spendPoints(2, 'AI Sentiment Analysis', 'ai_response');
    if (!pointsResult.success) {
      return NextResponse.json({
        ok: false,
        error: pointsResult.error || 'Insufficient points',
        insufficientPoints: true
      }, { status: 402 });
    }

    const { leadId } = await req.json();

    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'Lead ID required' }, { status: 400 });
    }

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('direction, content, created_at')
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    }

    const conversationHistory = (messages || []).map(m => ({
      direction: m.direction as 'inbound' | 'outbound',
      content: m.content,
    }));

    // Analyze sentiment
    const analysis = await analyzeLeadSentiment(conversationHistory);

    return NextResponse.json({
      ok: true,
      analysis,
      messageCount: messages?.length || 0,
    });

  } catch (error: any) {
    console.error('Error analyzing sentiment:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to analyze sentiment'
    }, { status: 500 });
  }
}

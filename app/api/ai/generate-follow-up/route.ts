import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateFollowUpMessage } from '@/lib/ai/openai';
import { spendPoints } from '@/lib/pointsSupabaseServer';

export const dynamic = "force-dynamic";

/**
 * AI Follow-up Generator - Generate contextual follow-up messages
 * POST /api/ai/generate-follow-up
 * Cost: 2 points per request
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Check and deduct points before generating follow-up
    const pointsResult = await spendPoints(2, 'AI Follow-up Message', 'ai_response');
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

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    // Calculate days since contact
    const daysSinceContact = lead.last_contacted
      ? Math.floor((Date.now() - new Date(lead.last_contacted).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Get recent messages for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('direction, content')
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    const conversationSummary = recentMessages
      ?.map(m => m.content)
      .join('. ')
      .slice(0, 200);

    // Generate follow-up
    const followUpMessage = await generateFollowUpMessage(
      {
        firstName: lead.first_name,
        status: lead.status,
        disposition: lead.disposition,
        daysSinceContact,
      },
      conversationSummary
    );

    return NextResponse.json({
      ok: true,
      message: followUpMessage,
      leadContext: {
        name: lead.first_name,
        status: lead.status,
        daysSinceContact,
      },
    });

  } catch (error: any) {
    console.error('Error generating follow-up:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to generate follow-up'
    }, { status: 500 });
  }
}

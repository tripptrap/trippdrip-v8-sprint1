import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSmartReplies } from '@/lib/ai/openai';
import { spendPoints } from '@/lib/pointsSupabase';

export const dynamic = "force-dynamic";

/**
 * AI Smart Replies - Generate contextual reply suggestions
 * POST /api/ai/smart-replies
 * Cost: 2 points per request
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Check and deduct points before generating AI response
    const pointsResult = await spendPoints(2, 'AI Smart Reply Suggestions', 'ai_response');
    if (!pointsResult.success) {
      return NextResponse.json({
        ok: false,
        error: pointsResult.error || 'Insufficient points',
        insufficientPoints: true
      }, { status: 402 });
    }

    const { leadId, threadId } = await req.json();

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

    // Get conversation history
    const { data: messages } = await supabase
      .from('messages')
      .select('direction, content, created_at')
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (messages || []).reverse().map(m => ({
      direction: m.direction as 'inbound' | 'outbound',
      content: m.content,
      timestamp: m.created_at,
    }));

    // Get user context
    const { data: userProfile } = await supabase
      .from('users')
      .select('full_name, business_name')
      .eq('id', user.id)
      .single();

    // Generate AI suggestions
    const suggestions = await generateSmartReplies(
      {
        firstName: lead.first_name,
        lastName: lead.last_name,
        company: lead.company,
        status: lead.status,
        disposition: lead.disposition,
      },
      conversationHistory,
      {
        businessName: userProfile?.business_name,
        agentName: userProfile?.full_name,
      }
    );

    return NextResponse.json({
      ok: true,
      suggestions,
      lead: {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
      },
    });

  } catch (error: any) {
    console.error('Error generating smart replies:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to generate suggestions'
    }, { status: 500 });
  }
}

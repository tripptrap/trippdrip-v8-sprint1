import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateLeadScore } from '@/lib/leadScoring';

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow longer execution for bulk operations

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get all leads for this user
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id);

    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch leads' }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, message: 'No leads to score', updated: 0 });
    }

    // Get all threads for message data
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id);

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch threads' }, { status: 500 });
    }

    // Calculate scores for each lead
    const updates = [];
    for (const lead of leads) {
      // Find thread for this lead
      const thread = (threads || []).find((t: any) => t.lead_id === lead.id);

      // Prepare lead data for scoring
      const leadData = {
        disposition: lead.disposition || null,
        lastEngaged: thread?.last_message_at || null,
        totalSent: thread?.messages_from_user || 0,
        totalReceived: thread?.messages_from_lead || 0,
        responseRate: thread?.messages_from_user > 0
          ? (thread?.messages_from_lead || 0) / thread.messages_from_user
          : 0,
        createdAt: lead.created_at,
      };

      // Calculate score
      const scoreResult = calculateLeadScore(leadData);

      // Prepare update
      updates.push({
        id: lead.id,
        score: scoreResult.score,
        temperature: scoreResult.temperature,
      });
    }

    // Batch update all leads
    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          score: update.score,
          temperature: update.temperature,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating lead ${update.id}:`, updateError);
        failCount++;
      } else {
        successCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully updated ${successCount} lead scores`,
      updated: successCount,
      failed: failCount,
      total: leads.length,
    });

  } catch (error: any) {
    console.error('Error in recalculate-scores:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

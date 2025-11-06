import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, suggestions: [], error: 'Not authenticated' }, { status: 401 });
    }

    // Get all leads with threads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone, email, disposition, created_at')
      .eq('user_id', user.id);

    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      return NextResponse.json({ ok: false, suggestions: [], error: leadsError.message }, { status: 500 });
    }

    // Get all threads
    const { data: threads, error: threadsError } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id);

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
    }

    // Get existing follow-ups to avoid duplicates
    const { data: existingFollowUps, error: followUpsError } = await supabase
      .from('follow_ups')
      .select('lead_id, status')
      .eq('user_id', user.id)
      .eq('status', 'pending');

    const existingFollowUpLeadIds = new Set(
      (existingFollowUps || []).map(fu => fu.lead_id)
    );

    // Generate suggestions
    const suggestions = [];
    const now = new Date();

    for (const lead of leads || []) {
      // Skip if already has pending follow-up
      if (existingFollowUpLeadIds.has(lead.id)) {
        continue;
      }

      const thread = (threads || []).find(t => t.lead_id === lead.id);

      // Suggestion 1: No response after initial message (sent 2+ days ago)
      if (thread && thread.messages_from_user > 0 && thread.messages_from_lead === 0) {
        const lastMessageDate = new Date(thread.last_message_at || thread.created_at);
        const daysSinceMessage = (now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceMessage >= 2) {
          suggestions.push({
            lead_id: lead.id,
            lead_name: `${lead.first_name} ${lead.last_name}`,
            lead_phone: lead.phone,
            title: `Follow up - No response from ${lead.first_name}`,
            notes: `Sent ${thread.messages_from_user} message(s) ${Math.floor(daysSinceMessage)} days ago with no response.`,
            priority: daysSinceMessage >= 5 ? 'high' : 'medium',
            reminder_type: 'auto_no_response',
            suggested_due_date: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
            reason: `No response for ${Math.floor(daysSinceMessage)} days`,
          });
        }
      }

      // Suggestion 2: Lead engaged but no follow-up in 3+ days
      if (thread && thread.messages_from_lead > 0) {
        const lastMessageDate = new Date(thread.last_message_at || thread.created_at);
        const daysSinceMessage = (now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceMessage >= 3 && lead.disposition !== 'sold' && lead.disposition !== 'do_not_contact') {
          suggestions.push({
            lead_id: lead.id,
            lead_name: `${lead.first_name} ${lead.last_name}`,
            lead_phone: lead.phone,
            title: `Follow up with ${lead.first_name}`,
            notes: `Lead has engaged (${thread.messages_from_lead} responses) but no contact in ${Math.floor(daysSinceMessage)} days.`,
            priority: 'medium',
            reminder_type: 'auto_follow_up',
            suggested_due_date: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            reason: `Engaged lead, ${Math.floor(daysSinceMessage)} days since last message`,
          });
        }
      }

      // Suggestion 3: Hot leads with no recent contact
      if (lead.disposition === 'hot' || lead.disposition === 'interested') {
        const lastContactDate = thread?.last_message_at
          ? new Date(thread.last_message_at)
          : new Date(lead.created_at);
        const daysSinceContact = (now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceContact >= 2) {
          suggestions.push({
            lead_id: lead.id,
            lead_name: `${lead.first_name} ${lead.last_name}`,
            lead_phone: lead.phone,
            title: `URGENT: Follow up with hot lead ${lead.first_name}`,
            notes: `This is a ${lead.disposition} lead with no contact in ${Math.floor(daysSinceContact)} days.`,
            priority: 'urgent',
            reminder_type: 'auto_callback',
            suggested_due_date: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(), // In 4 hours
            reason: `Hot/interested lead, ${Math.floor(daysSinceContact)} days since last contact`,
          });
        }
      }

      // Suggestion 4: New leads with no initial contact after 1 day
      if (!thread || thread.messages_from_user === 0) {
        const leadAge = (now.getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24);

        if (leadAge >= 1 && leadAge <= 7) {
          suggestions.push({
            lead_id: lead.id,
            lead_name: `${lead.first_name} ${lead.last_name}`,
            lead_phone: lead.phone,
            title: `Reach out to new lead ${lead.first_name}`,
            notes: `New lead added ${Math.floor(leadAge)} day(s) ago with no initial contact yet.`,
            priority: leadAge >= 3 ? 'high' : 'medium',
            reminder_type: 'auto_callback',
            suggested_due_date: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(), // In 12 hours
            reason: `New lead, no contact in ${Math.floor(leadAge)} day(s)`,
          });
        }
      }
    }

    // Sort by priority (urgent > high > medium > low)
    const priorityOrder: { [key: string]: number } = { urgent: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return NextResponse.json({ ok: true, suggestions: suggestions.slice(0, 50) }); // Limit to 50 suggestions
  } catch (error: any) {
    console.error('Error generating follow-up suggestions:', error);
    return NextResponse.json({ ok: false, suggestions: [], error: error.message }, { status: 500 });
  }
}

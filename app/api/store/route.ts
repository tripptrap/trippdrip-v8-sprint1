import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Get all store data (leads, threads, messages)
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ 
        ok: false, 
        store: { leads: [], threads: [], messages: [] }, 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    // Fetch all data in parallel
    const [leadsResult, threadsResult, messagesResult] = await Promise.all([
      supabase.from('leads').select('*').eq('user_id', user.id),
      supabase.from('threads').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('messages').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
    ]);

    if (leadsResult.error) {
      console.error('Error fetching leads:', leadsResult.error);
      return NextResponse.json({ ok: false, store: { leads: [], threads: [], messages: [] }, error: leadsResult.error.message }, { status: 500 });
    }

    if (threadsResult.error) {
      console.error('Error fetching threads:', threadsResult.error);
      return NextResponse.json({ ok: false, store: { leads: [], threads: [], messages: [] }, error: threadsResult.error.message }, { status: 500 });
    }

    if (messagesResult.error) {
      console.error('Error fetching messages:', messagesResult.error);
      return NextResponse.json({ ok: false, store: { leads: [], threads: [], messages: [] }, error: messagesResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      store: {
        leads: leadsResult.data || [],
        threads: threadsResult.data || [],
        messages: messagesResult.data || []
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/store:', error);
    return NextResponse.json({ ok: false, store: { leads: [], threads: [], messages: [] }, error: error.message }, { status: 500 });
  }
}

// Batch update store data
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leads, threads, messages } = body;

    // This is a simplified batch update - in production you'd want more sophisticated upsert logic
    // For now, we'll just support adding new items

    const results: any = {};

    if (leads && Array.isArray(leads)) {
      for (const lead of leads) {
        const leadData = {
          user_id: user.id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          phone: lead.phone,
          email: lead.email,
          state: lead.state,
          tags: lead.tags || [],
          status: lead.status,
          disposition: lead.disposition,
          custom_fields: lead.custom_fields || {}
        };

        if (lead.id && typeof lead.id === 'string' && lead.id.includes('-')) {
          // Update existing
          await supabase.from('leads').update(leadData).eq('id', lead.id).eq('user_id', user.id);
        } else {
          // Insert new
          await supabase.from('leads').insert(leadData);
        }
      }
      results.leads = 'updated';
    }

    if (threads && Array.isArray(threads)) {
      for (const thread of threads) {
        const threadData = {
          user_id: user.id,
          lead_id: thread.lead_id,
          lead_name: thread.lead_name,
          lead_phone: thread.lead_phone,
          channel: thread.channel,
          last_message_snippet: thread.last_message_snippet,
          last_sender: thread.last_sender,
          unread: thread.unread || false,
          campaign_id: thread.campaign_id || null,
          flow_step: thread.flow_step || null
        };

        if (thread.id && typeof thread.id === 'string' && thread.id.includes('-')) {
          // Update existing
          await supabase.from('threads').update(threadData).eq('id', thread.id).eq('user_id', user.id);
        } else {
          // Insert new
          await supabase.from('threads').insert(threadData);
        }
      }
      results.threads = 'updated';
    }

    if (messages && Array.isArray(messages)) {
      for (const message of messages) {
        const messageData = {
          user_id: user.id,
          thread_id: message.thread_id,
          direction: message.direction,
          sender: message.sender,
          body: message.body
        };

        if (message.id && typeof message.id === 'string' && message.id.includes('-')) {
          // Skip updates for messages - they're immutable
          continue;
        } else {
          // Insert new
          await supabase.from('messages').insert(messageData);
        }
      }
      results.messages = 'updated';
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error('Error in POST /api/store:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

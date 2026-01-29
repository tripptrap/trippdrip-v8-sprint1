// API Route: Get user's message threads/conversations
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    // Optional filter: 'conversations' (default), 'campaign_only', 'all'
    const view = searchParams.get('view') || 'conversations';

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user's conversation threads with campaign info
    // Use left join syntax to handle null lead_id
    let query = supabase
      .from('threads')
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        ),
        leads:lead_id (
          id,
          first_name,
          last_name,
          phone,
          email,
          state,
          zip_code,
          status,
          tags
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    const { data: threads, error } = await query;

    if (error) {
      console.error('Error fetching threads:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Helper to normalize phone numbers (strip to just digits, last 10)
    const normalizePhone = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      return digits.slice(-10); // Get last 10 digits (removes country code)
    };

    // For threads without lead_id, try to find matching lead by phone number
    const threadsWithoutLeads = (threads || []).filter(t => !t.leads && t.phone_number);
    if (threadsWithoutLeads.length > 0) {
      // Get all user's leads to match by normalized phone
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone, email, state, zip_code, status, tags')
        .eq('user_id', user.id);

      // Create a map of normalized phone -> lead for quick lookup
      const phoneToLead = new Map();
      (allLeads || []).forEach(lead => {
        if (lead.phone) {
          const normalized = normalizePhone(lead.phone);
          phoneToLead.set(normalized, lead);
        }
      });

      // Attach matched leads to threads using normalized phone comparison
      threads?.forEach(thread => {
        if (!thread.leads && thread.phone_number) {
          const normalizedThreadPhone = normalizePhone(thread.phone_number);
          if (phoneToLead.has(normalizedThreadPhone)) {
            thread.leads = phoneToLead.get(normalizedThreadPhone);
          }
        }
      });
    }

    // Filter based on view type
    let filteredThreads = threads || [];

    if (view === 'conversations') {
      // Show: individual threads (no campaign_id) + campaign threads with responses (messages_from_lead > 0)
      filteredThreads = filteredThreads.filter(t =>
        !t.campaign_id || (t.messages_from_lead && t.messages_from_lead > 0)
      );
    } else if (view === 'campaign_only') {
      // Show: campaign threads without responses (for "Campaign Recipients" view)
      filteredThreads = filteredThreads.filter(t =>
        t.campaign_id && (!t.messages_from_lead || t.messages_from_lead === 0)
      );
    }
    // 'all' returns everything

    return NextResponse.json({
      success: true,
      threads: filteredThreads,
      totalCount: threads?.length || 0,
      filteredCount: filteredThreads.length,
    });
  } catch (error: any) {
    console.error('Error in threads API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch threads' },
      { status: 500 }
    );
  }
}

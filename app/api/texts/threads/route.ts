// API Route: Get user's message threads with lead/client classification
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const channel = searchParams.get('channel') || null; // 'sms' | 'whatsapp' | null (all)
    const tab = searchParams.get('tab') || 'all'; // 'leads' | 'clients' | 'all'
    const search = searchParams.get('search') || '';

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch threads with lead info
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
          tags,
          converted
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    // Filter by channel if specified
    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data: threads, error } = await query;

    if (error) {
      console.error('Error fetching threads:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Normalize phone for matching
    const normalizePhone = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      return digits.slice(-10);
    };

    // For threads without lead_id, try to find matching lead by phone
    const threadsWithoutLeads = (threads || []).filter(t => !t.leads && t.phone_number);
    if (threadsWithoutLeads.length > 0) {
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone, email, state, zip_code, status, tags, converted')
        .eq('user_id', user.id);

      const phoneToLead = new Map();
      (allLeads || []).forEach(lead => {
        if (lead.phone) {
          phoneToLead.set(normalizePhone(lead.phone), lead);
        }
      });

      threads?.forEach(thread => {
        if (!thread.leads && thread.phone_number) {
          const match = phoneToLead.get(normalizePhone(thread.phone_number));
          if (match) {
            thread.leads = match;
          }
        }
      });
    }

    // Fetch all clients for this user to determine contact_type
    const { data: clients } = await supabase
      .from('clients')
      .select('id, original_lead_id, first_name, last_name, phone, email')
      .eq('user_id', user.id);

    const leadIdToClient = new Map();
    const phoneToClient = new Map();
    (clients || []).forEach(client => {
      if (client.original_lead_id) {
        leadIdToClient.set(client.original_lead_id, client);
      }
      if (client.phone) {
        phoneToClient.set(normalizePhone(client.phone), client);
      }
    });

    // Classify threads and add contact_type
    let enrichedThreads = (threads || []).map(thread => {
      const leadId = thread.lead_id || thread.leads?.id;
      const isConverted = thread.leads?.converted === true;
      const hasClientRecord = leadId ? leadIdToClient.has(leadId) : false;
      const phoneClient = thread.phone_number ? phoneToClient.get(normalizePhone(thread.phone_number)) : null;

      const contactType = (isConverted || hasClientRecord || phoneClient) ? 'client' : 'lead';
      const clientRecord = hasClientRecord ? leadIdToClient.get(leadId) : phoneClient;

      // Build display name
      const lead = thread.leads;
      let displayName = 'Unknown';
      if (contactType === 'client' && clientRecord) {
        displayName = [clientRecord.first_name, clientRecord.last_name].filter(Boolean).join(' ') || 'Unknown';
      } else if (lead) {
        displayName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
      }

      return {
        ...thread,
        contact_type: contactType,
        client: clientRecord || null,
        display_name: displayName,
      };
    });

    // Filter by search query (name or phone)
    if (search) {
      const q = search.toLowerCase();
      enrichedThreads = enrichedThreads.filter(t =>
        t.display_name.toLowerCase().includes(q) ||
        (t.phone_number && t.phone_number.includes(q))
      );
    }

    // Filter by tab (leads vs clients)
    if (tab === 'leads') {
      enrichedThreads = enrichedThreads.filter(t => t.contact_type === 'lead');
    } else if (tab === 'clients') {
      enrichedThreads = enrichedThreads.filter(t => t.contact_type === 'client');
    }

    // Count totals before tab filtering for tab badges
    const allThreads = (threads || []).map(thread => {
      const leadId = thread.lead_id || thread.leads?.id;
      const isConverted = thread.leads?.converted === true;
      const hasClientRecord = leadId ? leadIdToClient.has(leadId) : false;
      const phoneClient = thread.phone_number ? phoneToClient.get(normalizePhone(thread.phone_number)) : null;
      return (isConverted || hasClientRecord || phoneClient) ? 'client' : 'lead';
    });

    return NextResponse.json({
      success: true,
      threads: enrichedThreads,
      counts: {
        total: threads?.length || 0,
        leads: allThreads.filter(t => t === 'lead').length,
        clients: allThreads.filter(t => t === 'client').length,
      },
    });
  } catch (error: any) {
    console.error('Error in texts/threads API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch threads' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const url = new URL(req.url);
    const phone = url.searchParams.get('phone');
    const leadId = url.searchParams.get('leadId');

    if (!phone && !leadId) {
      return NextResponse.json({ ok: false, error: 'Phone number or leadId required' }, { status: 400 });
    }

    // Find threads by lead_id first (most reliable), then fall back to phone matching
    let threads: { id: string }[] = [];

    if (leadId) {
      const { data, error } = await supabase
        .from('threads')
        .select('id')
        .eq('user_id', user.id)
        .eq('lead_id', leadId);

      if (!error && data && data.length > 0) {
        threads = data;
      }
    }

    // If no threads found by lead_id, try by phone
    if (threads.length === 0 && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      // Try multiple phone formats
      const phoneVariants = [
        phone,
        normalizedPhone,
        `+1${normalizedPhone}`,
        `+${normalizedPhone}`,
      ];
      // Also handle case where stored phone has +1 but input already has country code
      if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
        phoneVariants.push(`+${normalizedPhone}`);
        phoneVariants.push(normalizedPhone.slice(1));
        phoneVariants.push(`+1${normalizedPhone.slice(1)}`);
      }
      const uniqueVariants = [...new Set(phoneVariants)];

      const { data, error } = await supabase
        .from('threads')
        .select('id')
        .eq('user_id', user.id)
        .or(uniqueVariants.map(v => `phone_number.eq.${v}`).join(','));

      if (!error && data) {
        threads = data;
      }
    }

    if (threads.length === 0) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const threadIds = threads.map(t => t.id);

    // Fetch messages for these threads
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', user.id)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, messages: messages || [], threadIds });
  } catch (error: any) {
    console.error('Error in GET /api/messages/by-phone:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

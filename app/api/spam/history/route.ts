import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: Fetch sending history for velocity checks
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        history: [],
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // Get history from last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const { data: history, error } = await supabase
      .from('sending_history')
      .select('sent_at')
      .eq('user_id', user.id)
      .gte('sent_at', oneDayAgo.toISOString())
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('Error fetching sending history:', error);
      return NextResponse.json({
        ok: false,
        history: [],
        error: error.message
      }, { status: 500 });
    }

    // Convert to timestamps
    const timestamps = history.map(h => new Date(h.sent_at).getTime());

    return NextResponse.json({
      ok: true,
      history: timestamps
    });
  } catch (error: any) {
    console.error('Error in GET /api/spam/history:', error);
    return NextResponse.json({
      ok: false,
      history: [],
      error: error.message
    }, { status: 500 });
  }
}

// POST: Record a message send
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber, recipientCount } = body;

    // Insert new sending record
    const { error: insertError } = await supabase
      .from('sending_history')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber || null,
        recipient_count: recipientCount || 1,
        sent_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error recording message send:', insertError);
      return NextResponse.json({
        ok: false,
        error: insertError.message
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in POST /api/spam/history:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

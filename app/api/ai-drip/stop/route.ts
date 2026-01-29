// API Route: Stop AI Drip
// Stops an active AI drip

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    } catch (authErr) {
      console.error('Auth error:', authErr);
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { dripId, threadId } = await req.json();

    if (!dripId && !threadId) {
      return NextResponse.json({ success: false, error: 'Drip ID or Thread ID required' }, { status: 400 });
    }

    let query = supabase
      .from('ai_drips')
      .update({
        status: 'stopped',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (dripId) {
      query = query.eq('id', dripId);
    } else if (threadId) {
      query = query.eq('thread_id', threadId);
    }

    const { data: updatedDrip, error: updateError } = await query.select().single();

    if (updateError) {
      // If no rows found, it might not be active
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({
          success: false,
          error: 'No active drip found'
        }, { status: 404 });
      }
      console.error('Error stopping AI drip:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // Cancel remaining scheduled messages
    if (updatedDrip) {
      await supabase
        .from('ai_drip_messages')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('drip_id', updatedDrip.id)
        .eq('status', 'scheduled');
    }

    console.log('✅ AI Drip stopped:', updatedDrip?.id);

    return NextResponse.json({
      success: true,
      drip: updatedDrip ? {
        id: updatedDrip.id,
        status: updatedDrip.status,
        messagesSent: updatedDrip.messages_sent,
      } : null
    });

  } catch (error: any) {
    console.error('Error stopping AI drip:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

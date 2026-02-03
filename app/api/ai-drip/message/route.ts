import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Edit a scheduled message
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { messageId, content } = body;

    if (!messageId || !content) {
      return NextResponse.json({ success: false, error: 'messageId and content are required' }, { status: 400 });
    }

    // Verify ownership and message is still scheduled
    const { data: message, error: fetchError } = await supabase
      .from('ai_drip_messages')
      .select('id, drip_id, status, ai_drips!inner(user_id)')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    if ((message as any).ai_drips?.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (message.status !== 'scheduled') {
      return NextResponse.json({ success: false, error: 'Can only edit scheduled messages' }, { status: 400 });
    }

    // Update the message content
    const { error: updateError } = await supabase
      .from('ai_drip_messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating message:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Message updated' });

  } catch (error: any) {
    console.error('AI drip message edit error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// Cancel a scheduled message
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('messageId');

    if (!messageId) {
      return NextResponse.json({ success: false, error: 'messageId is required' }, { status: 400 });
    }

    // Verify ownership and message is still scheduled
    const { data: message, error: fetchError } = await supabase
      .from('ai_drip_messages')
      .select('id, drip_id, status, ai_drips!inner(user_id)')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    if ((message as any).ai_drips?.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (message.status !== 'scheduled') {
      return NextResponse.json({ success: false, error: 'Can only cancel scheduled messages' }, { status: 400 });
    }

    // Cancel the message
    const { error: updateError } = await supabase
      .from('ai_drip_messages')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error cancelling message:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Message cancelled' });

  } catch (error: any) {
    console.error('AI drip message cancel error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

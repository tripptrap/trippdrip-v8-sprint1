// API Route: Manage AI Drip Messages
// Edit or delete individual scheduled drip messages

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Edit a scheduled drip message
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { messageId, content } = await req.json();

    if (!messageId || !content) {
      return NextResponse.json({ success: false, error: 'Message ID and content required' }, { status: 400 });
    }

    // Validate content length for SMS
    if (content.length > 320) {
      return NextResponse.json({ success: false, error: 'Message too long (max 320 characters)' }, { status: 400 });
    }

    // Update the message (only if it belongs to this user and is still scheduled)
    const { data: updatedMessage, error } = await supabase
      .from('ai_drip_messages')
      .update({
        content: content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('user_id', user.id)
      .eq('status', 'scheduled')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Message not found or already sent' }, { status: 404 });
      }
      console.error('Error updating drip message:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('✅ Drip message updated:', messageId);

    return NextResponse.json({
      success: true,
      message: {
        id: updatedMessage.id,
        messageNumber: updatedMessage.message_number,
        content: updatedMessage.content,
        scheduledFor: updatedMessage.scheduled_for,
        status: updatedMessage.status,
      }
    });

  } catch (error: any) {
    console.error('Error updating drip message:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Delete (cancel) a scheduled drip message
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('messageId');
    const dripId = searchParams.get('dripId');
    const permanent = searchParams.get('permanent') === 'true';

    // Delete entire drip
    if (dripId) {
      // First verify the drip belongs to this user
      const { data: drip, error: fetchError } = await supabase
        .from('ai_drips')
        .select('id')
        .eq('id', dripId)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !drip) {
        return NextResponse.json({ success: false, error: 'Drip not found' }, { status: 404 });
      }

      // Cancel all scheduled messages
      await supabase
        .from('ai_drip_messages')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('drip_id', dripId)
        .eq('status', 'scheduled');

      // Stop the drip
      const { error: updateError } = await supabase
        .from('ai_drips')
        .update({
          status: 'stopped',
          updated_at: new Date().toISOString(),
        })
        .eq('id', dripId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error stopping drip:', updateError);
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }

      console.log('✅ Drip deleted:', dripId);

      return NextResponse.json({ success: true, deleted: 'drip', dripId });
    }

    // Delete single message
    if (messageId) {
      // If permanent delete, actually remove from database
      if (permanent) {
        const { error } = await supabase
          .from('ai_drip_messages')
          .delete()
          .eq('id', messageId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Error permanently deleting drip message:', error);
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        console.log('✅ Drip message permanently deleted:', messageId);
        return NextResponse.json({ success: true, deleted: 'message', messageId, permanent: true });
      }

      // Update to cancelled (only if it belongs to this user and is still scheduled)
      const { data: cancelledMessage, error } = await supabase
        .from('ai_drip_messages')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({ success: false, error: 'Message not found or already sent' }, { status: 404 });
        }
        console.error('Error deleting drip message:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // Check if all messages for this drip are now cancelled - if so, stop the drip
      const { data: remainingScheduled } = await supabase
        .from('ai_drip_messages')
        .select('id')
        .eq('drip_id', cancelledMessage.drip_id)
        .eq('status', 'scheduled');

      if (!remainingScheduled || remainingScheduled.length === 0) {
        // No more scheduled messages - stop the drip
        await supabase
          .from('ai_drips')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', cancelledMessage.drip_id);

        console.log('✅ Drip completed (all messages cancelled):', cancelledMessage.drip_id);
      }

      console.log('✅ Drip message cancelled:', messageId);

      return NextResponse.json({ success: true, deleted: 'message', messageId });
    }

    return NextResponse.json({ success: false, error: 'Message ID or Drip ID required' }, { status: 400 });

  } catch (error: any) {
    console.error('Error deleting drip message:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * Thread Management - Archive and Tag Operations
 * Handles archiving, unarchiving, and tagging of conversation threads
 */

// POST - Archive/Unarchive or Add/Remove Tags
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { action, threadId, threadIds, tagName } = body;

    if (!action) {
      return NextResponse.json({ ok: false, error: 'Action is required' }, { status: 400 });
    }

    // Columns is_archived and archived_at are expected to exist on threads table

    // Handle different actions
    switch (action) {
      case 'archive': {
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }


        // Try RPC first, fall back to direct update
        let archiveError: any = null;
        const rpcResult = await supabase.rpc('archive_thread', { thread_id_param: threadId });
        if (rpcResult.error) {
          // RPC doesn't exist — do direct update
          const { error } = await supabase
            .from('threads')
            .update({ is_archived: true, archived_at: new Date().toISOString() })
            .eq('id', threadId)
            .eq('user_id', user.id);
          archiveError = error;
        }

        if (archiveError) {
          console.error('Error archiving thread:', archiveError);
          return NextResponse.json({ ok: false, error: archiveError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, message: 'Thread archived successfully' });
      }

      case 'unarchive': {
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }


        const rpcResult = await supabase.rpc('unarchive_thread', { thread_id_param: threadId });
        let unarchiveError: any = null;
        if (rpcResult.error) {
          const { error } = await supabase
            .from('threads')
            .update({ is_archived: false, archived_at: null })
            .eq('id', threadId)
            .eq('user_id', user.id);
          unarchiveError = error;
        }

        if (unarchiveError) {
          console.error('Error unarchiving thread:', unarchiveError);
          return NextResponse.json({ ok: false, error: unarchiveError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, message: 'Thread unarchived successfully' });
      }

      case 'bulk_archive': {
        if (!threadIds || !Array.isArray(threadIds)) {
          return NextResponse.json({ ok: false, error: 'threadIds array required' }, { status: 400 });
        }


        const rpcResult = await supabase.rpc('bulk_archive_threads', { thread_ids: threadIds });
        let bulkError: any = null;
        if (rpcResult.error) {
          const { error } = await supabase
            .from('threads')
            .update({ is_archived: true, archived_at: new Date().toISOString() })
            .in('id', threadIds)
            .eq('user_id', user.id);
          bulkError = error;
        }

        if (bulkError) {
          console.error('Error bulk archiving threads:', bulkError);
          return NextResponse.json({ ok: false, error: bulkError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: `${threadIds.length} threads archived successfully`,
          count: threadIds.length,
        });
      }

      case 'add_tag': {
        if (!threadId || !tagName) {
          return NextResponse.json({ ok: false, error: 'threadId and tagName required' }, { status: 400 });
        }

        // Try RPC first, fall back to direct array append
        const rpcResult = await supabase.rpc('add_thread_tag', { thread_id_param: threadId, tag_name: tagName });
        if (rpcResult.error) {
          // Direct approach: fetch current tags, add new one
          const { data: thread } = await supabase
            .from('threads')
            .select('conversation_tags')
            .eq('id', threadId)
            .eq('user_id', user.id)
            .single();

          const currentTags: string[] = thread?.conversation_tags || [];
          if (!currentTags.includes(tagName)) {
            const { error } = await supabase
              .from('threads')
              .update({ conversation_tags: [...currentTags, tagName] })
              .eq('id', threadId)
              .eq('user_id', user.id);

            if (error) {
              console.error('Error adding tag:', error);
              return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
            }
          }
        }

        return NextResponse.json({ ok: true, message: 'Tag added successfully' });
      }

      case 'remove_tag': {
        if (!threadId || !tagName) {
          return NextResponse.json({ ok: false, error: 'threadId and tagName required' }, { status: 400 });
        }

        const rpcResult = await supabase.rpc('remove_thread_tag', { thread_id_param: threadId, tag_name: tagName });
        if (rpcResult.error) {
          const { data: thread } = await supabase
            .from('threads')
            .select('conversation_tags')
            .eq('id', threadId)
            .eq('user_id', user.id)
            .single();

          const currentTags: string[] = thread?.conversation_tags || [];
          const { error } = await supabase
            .from('threads')
            .update({ conversation_tags: currentTags.filter((t: string) => t !== tagName) })
            .eq('id', threadId)
            .eq('user_id', user.id);

          if (error) {
            console.error('Error removing tag:', error);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
          }
        }

        return NextResponse.json({ ok: true, message: 'Tag removed successfully' });
      }

      case 'toggle_ai': {
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }

        const disable = body.disable === true;

        const { error: toggleError } = await supabase
          .from('threads')
          .update({ ai_disabled: disable })
          .eq('id', threadId)
          .eq('user_id', user.id);

        if (toggleError) {
          // Column might not exist yet — try without it
          if (toggleError.message.includes('ai_disabled')) {
            return NextResponse.json({ ok: true, message: 'AI toggle not available (column missing)', ai_disabled: false });
          }
          console.error('Error toggling AI:', toggleError);
          return NextResponse.json({ ok: false, error: toggleError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: disable ? 'AI disabled — you have taken over this conversation' : 'AI re-enabled for this conversation',
          ai_disabled: disable,
        });
      }

      default:
        return NextResponse.json({
          ok: false,
          error: `Unknown action: ${action}. Valid actions: archive, unarchive, bulk_archive, add_tag, remove_tag, toggle_ai`
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error in thread management:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to manage thread'
    }, { status: 500 });
  }
}

// GET - Fetch threads with filtering (archived/active, by tag)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const archived = searchParams.get('archived') === 'true';
    const tag = searchParams.get('tag');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('threads')
      .select('*, leads(first_name, last_name, phone, email)')
      .eq('user_id', user.id)
      .eq('is_archived', archived)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    // Filter by tag if provided
    if (tag) {
      query = query.contains('conversation_tags', [tag]);
    }

    const { data: threads, error: threadsError } = await query;

    if (threadsError) {
      console.error('Error fetching threads:', threadsError);
      return NextResponse.json({ ok: false, error: threadsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      threads: threads || [],
      count: threads?.length || 0,
      filters: {
        archived,
        tag: tag || null,
      }
    });

  } catch (error: any) {
    console.error('Error fetching threads:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch threads'
    }, { status: 500 });
  }
}

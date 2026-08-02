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


        // Scoped update rather than the archive_thread RPC. That RPC was
        // SECURITY DEFINER with no ownership check and granted to anon, so it
        // archived anyone's thread by id — see
        // supabase/migrations/scope_thread_archive_rpcs_to_owner.sql. Doing it
        // here keeps the ownership predicate next to the handler that relies on
        // it, and `.select()` is what makes "not yours" distinguishable from
        // "done" (#110).
        const { data: archived, error: archiveError } = await supabase
          .from('threads')
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .eq('id', threadId)
          .eq('user_id', user.id)
          .select('id');

        if (archiveError) {
          console.error('Error archiving thread:', archiveError);
          return NextResponse.json({ ok: false, error: archiveError.message }, { status: 500 });
        }
        if (!archived?.length) {
          return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, message: 'Thread archived successfully' });
      }

      case 'unarchive': {
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }


        const { data: unarchived, error: unarchiveError } = await supabase
          .from('threads')
          .update({ is_archived: false, archived_at: null })
          .eq('id', threadId)
          .eq('user_id', user.id)
          .select('id');

        if (unarchiveError) {
          console.error('Error unarchiving thread:', unarchiveError);
          return NextResponse.json({ ok: false, error: unarchiveError.message }, { status: 500 });
        }
        if (!unarchived?.length) {
          return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, message: 'Thread unarchived successfully' });
      }

      case 'bulk_archive': {
        if (!threadIds || !Array.isArray(threadIds)) {
          return NextResponse.json({ ok: false, error: 'threadIds array required' }, { status: 400 });
        }


        const { data: bulkArchived, error: bulkError } = await supabase
          .from('threads')
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .in('id', threadIds)
          .eq('user_id', user.id)
          .select('id');

        if (bulkError) {
          console.error('Error bulk archiving threads:', bulkError);
          return NextResponse.json({ ok: false, error: bulkError.message }, { status: 500 });
        }

        // Reports what was archived, not what was asked for. This used to return
        // `count: threadIds.length` unconditionally, so a request naming ten
        // threads the caller does not own still answered "10 threads archived".
        const bulkCount = bulkArchived?.length ?? 0;
        return NextResponse.json({
          ok: true,
          message: `${bulkCount} thread${bulkCount === 1 ? '' : 's'} archived successfully`,
          count: bulkCount,
          requested: threadIds.length,
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

        // `.select('id')` is not decoration. A guarded UPDATE that matches no
        // row — wrong threadId, or a thread belonging to someone else — returns
        // `error: null` and is indistinguishable from success without it. This
        // route reported "AI disabled — you have taken over this conversation"
        // for writes that touched nothing (#110).
        const { data: toggled, error: toggleError } = await supabase
          .from('threads')
          .update({ ai_disabled: disable })
          .eq('id', threadId)
          .eq('user_id', user.id)
          .select('id');

        if (toggleError) {
          // Previously swallowed any error mentioning `ai_disabled` and returned
          // ok:true, on the theory the column might be missing. It exists
          // (boolean, default false), so that guarded against nothing while
          // turning a real failure into a reported success — the user believes
          // they have taken over the conversation and the AI keeps replying.
          console.error('Error toggling AI:', toggleError);
          return NextResponse.json({ ok: false, error: toggleError.message }, { status: 500 });
        }

        if (!toggled || toggled.length === 0) {
          return NextResponse.json(
            { ok: false, error: 'Conversation not found' },
            { status: 404 }
          );
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
      .order('updated_at', { ascending: false, nullsFirst: false })
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

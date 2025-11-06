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

    // Handle different actions
    switch (action) {
      case 'archive':
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }
        const { data: archiveResult, error: archiveError } = await supabase
          .rpc('archive_thread', { thread_id_param: threadId });

        if (archiveError) {
          console.error('Error archiving thread:', archiveError);
          return NextResponse.json({ ok: false, error: archiveError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: 'Thread archived successfully',
          archived: archiveResult,
        });

      case 'unarchive':
        if (!threadId) {
          return NextResponse.json({ ok: false, error: 'threadId required' }, { status: 400 });
        }
        const { data: unarchiveResult, error: unarchiveError } = await supabase
          .rpc('unarchive_thread', { thread_id_param: threadId });

        if (unarchiveError) {
          console.error('Error unarchiving thread:', unarchiveError);
          return NextResponse.json({ ok: false, error: unarchiveError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: 'Thread unarchived successfully',
          unarchived: unarchiveResult,
        });

      case 'bulk_archive':
        if (!threadIds || !Array.isArray(threadIds)) {
          return NextResponse.json({ ok: false, error: 'threadIds array required' }, { status: 400 });
        }
        const { data: bulkArchiveCount, error: bulkArchiveError } = await supabase
          .rpc('bulk_archive_threads', { thread_ids: threadIds });

        if (bulkArchiveError) {
          console.error('Error bulk archiving threads:', bulkArchiveError);
          return NextResponse.json({ ok: false, error: bulkArchiveError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: `${bulkArchiveCount} threads archived successfully`,
          count: bulkArchiveCount,
        });

      case 'add_tag':
        if (!threadId || !tagName) {
          return NextResponse.json({ ok: false, error: 'threadId and tagName required' }, { status: 400 });
        }
        const { data: addTagResult, error: addTagError } = await supabase
          .rpc('add_thread_tag', { thread_id_param: threadId, tag_name: tagName });

        if (addTagError) {
          console.error('Error adding tag:', addTagError);
          return NextResponse.json({ ok: false, error: addTagError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: 'Tag added successfully',
          added: addTagResult,
        });

      case 'remove_tag':
        if (!threadId || !tagName) {
          return NextResponse.json({ ok: false, error: 'threadId and tagName required' }, { status: 400 });
        }
        const { data: removeTagResult, error: removeTagError } = await supabase
          .rpc('remove_thread_tag', { thread_id_param: threadId, tag_name: tagName });

        if (removeTagError) {
          console.error('Error removing tag:', removeTagError);
          return NextResponse.json({ ok: false, error: removeTagError.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          message: 'Tag removed successfully',
          removed: removeTagResult,
        });

      default:
        return NextResponse.json({
          ok: false,
          error: `Unknown action: ${action}. Valid actions: archive, unarchive, bulk_archive, add_tag, remove_tag`
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

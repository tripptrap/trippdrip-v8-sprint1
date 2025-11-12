// API Route: Get user's message threads/conversations
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user's conversation threads
    const { data: threads, error } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching threads:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      threads: threads || [],
    });
  } catch (error: any) {
    console.error('Error in threads API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch threads' },
      { status: 500 }
    );
  }
}

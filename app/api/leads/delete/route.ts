import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // Support bulk delete

    if (!id && !ids) {
      return NextResponse.json({ ok: false, error: 'Lead ID(s) required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Parse IDs
    const idsToDelete = ids ? ids.split(',').map(id => parseInt(id)) : [parseInt(id!)];

    // Delete leads (only those belonging to the current user)
    const { error, count } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', idsToDelete)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting lead(s):', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `${count || 0} lead(s) deleted successfully`,
      deletedCount: count || 0
    });
  } catch (error: any) {
    console.error('Error deleting lead(s):', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete lead(s)' },
      { status: 500 }
    );
  }
}

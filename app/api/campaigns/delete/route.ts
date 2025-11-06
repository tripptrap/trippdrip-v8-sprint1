import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Delete campaign (only if it belongs to current user)
    const { error, count } = await supabase
      .from('campaigns')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting campaign:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json({ ok: false, error: 'Campaign not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: 'Campaign deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}

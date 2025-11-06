import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, disposition } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Lead ID is required' }, { status: 400 });
    }

    if (!disposition) {
      return NextResponse.json({ ok: false, error: 'Disposition is required' }, { status: 400 });
    }

    // Validate disposition values
    const validDispositions = ['sold', 'not_interested', 'callback', 'qualified', 'nurture', null];
    if (!validDispositions.includes(disposition)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid disposition value' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Determine status based on disposition
    let status;
    if (disposition === 'not_interested') {
      status = 'archived';
    } else if (disposition === 'sold') {
      status = 'sold';
    }

    // Update lead (only if it belongs to current user)
    const updateData: any = { disposition };
    if (status) {
      updateData.status = status;
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead disposition:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Lead disposition updated successfully',
      lead
    });
  } catch (error: any) {
    console.error('Error updating lead disposition:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update disposition' },
      { status: 500 }
    );
  }
}

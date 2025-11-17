import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumbers, reason, source } = body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return NextResponse.json({ ok: false, error: 'Phone numbers array is required' }, { status: 400 });
    }

    // Bulk add to DNC list
    const { data, error } = await supabase.rpc('bulk_add_to_dnc', {
      p_user_id: user.id,
      p_phone_numbers: phoneNumbers,
      p_reason: reason || 'manual',
      p_source: source || 'bulk_import'
    });

    if (error) {
      console.error('Error bulk adding to DNC:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    return NextResponse.json({
      ok: true,
      ...result
    });

  } catch (error: any) {
    console.error('Error in bulk add DNC route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

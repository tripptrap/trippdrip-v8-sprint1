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
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json({ ok: false, error: 'Phone number is required' }, { status: 400 });
    }

    // Remove from DNC list
    const { data, error } = await supabase.rpc('remove_from_dnc', {
      p_user_id: user.id,
      p_phone_number: phoneNumber
    });

    if (error) {
      console.error('Error removing from DNC:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    return NextResponse.json({
      ok: true,
      ...result
    });

  } catch (error: any) {
    console.error('Error in remove DNC route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

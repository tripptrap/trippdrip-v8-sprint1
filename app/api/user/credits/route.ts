import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('Error fetching credits:', fetchError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch credits' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      credits: userData?.credits || 0,
    });
  } catch (error: any) {
    console.error('Error in credits API:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

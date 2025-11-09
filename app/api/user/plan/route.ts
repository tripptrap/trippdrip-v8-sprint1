import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        planType: 'basic',
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('plan_type')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user plan:', error);
      return NextResponse.json({
        ok: true,
        planType: 'basic'
      });
    }

    return NextResponse.json({
      ok: true,
      planType: userData?.plan_type || 'basic'
    });
  } catch (error: any) {
    console.error('Error in GET /api/user/plan:', error);
    return NextResponse.json({
      ok: true,
      planType: 'basic'
    });
  }
}

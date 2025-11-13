// API Route: Get available numbers from the pool
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get available verified numbers from pool
    const { data: availableNumbers, error } = await supabase
      .from('number_pool')
      .select('*')
      .eq('is_assigned', false)
      .eq('is_verified', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching available numbers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available numbers' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      numbers: availableNumbers || [],
      total: availableNumbers?.length || 0
    });

  } catch (error: any) {
    console.error('Get available numbers error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

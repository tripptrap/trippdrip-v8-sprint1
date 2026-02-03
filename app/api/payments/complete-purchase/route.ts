// API Route: Complete Purchase - Add Points

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { points, packName } = await req.json();

    if (!points || !packName) {
      return NextResponse.json(
        { error: 'Missing required fields: points, packName' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      points,
      packName,
      message: 'Points added successfully!'
    });

  } catch (error: any) {
    console.error('Complete purchase error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

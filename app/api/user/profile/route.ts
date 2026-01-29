// API Route: Get current user's profile info
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user data from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, subscription_tier, credits, monthly_credits')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || null,
      subscription_tier: userData?.subscription_tier || null,
      credits: userData?.credits || 0,
      monthly_credits: userData?.monthly_credits || 0,
    });

  } catch (error: any) {
    console.error('Get user profile error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

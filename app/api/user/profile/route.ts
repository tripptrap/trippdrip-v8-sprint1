// API Route: Get and update current user's profile info
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
      .select('id, full_name, phone_number, business_name, subscription_tier, credits, monthly_credits')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: userData?.full_name || user.user_metadata?.full_name || null,
      phone: userData?.phone_number || user.user_metadata?.phone || null,
      business_name: userData?.business_name || null,
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

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { full_name, phone } = body;

    // Update user metadata in Supabase Auth
    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        full_name: full_name ?? user.user_metadata?.full_name,
        phone: phone ?? user.user_metadata?.phone,
      },
    });

    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 400 });
    }

    // Also update the users table to keep in sync
    const userUpdates: any = {};
    if (full_name !== undefined) userUpdates.full_name = full_name;
    if (phone !== undefined) userUpdates.phone_number = phone;

    if (Object.keys(userUpdates).length > 0) {
      const { error: dbUpdateError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', user.id);

      if (dbUpdateError) {
        console.error('Error syncing profile to users table:', dbUpdateError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

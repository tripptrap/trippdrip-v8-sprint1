// API Route: Provision Twilio Subaccount for User
// This endpoint creates a new Twilio subaccount for the authenticated user

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTwilioSubaccount, userHasSubaccount } from '@/lib/twilioSubaccounts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user already has a subaccount
    const hasSubaccount = await userHasSubaccount(user.id);
    if (hasSubaccount) {
      return NextResponse.json(
        { error: 'User already has a Twilio subaccount' },
        { status: 400 }
      );
    }

    // Get user details
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log(`📱 Provisioning Twilio subaccount for user ${user.id}...`);

    // Create the subaccount
    const result = await createTwilioSubaccount({
      userId: user.id,
      userEmail: userData.email,
      userName: userData.full_name,
    });

    if (!result.success) {
      console.error('❌ Failed to create subaccount:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to create Twilio subaccount' },
        { status: 500 }
      );
    }

    console.log(`✅ Subaccount created successfully: ${result.subaccountSid}`);

    return NextResponse.json({
      success: true,
      subaccountSid: result.subaccountSid,
      friendlyName: result.friendlyName,
      message: 'Twilio subaccount created successfully',
    });
  } catch (error) {
    console.error('Error provisioning Twilio subaccount:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check if user has a subaccount
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has a subaccount
    const { data, error } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status, twilio_subaccount_friendly_name, twilio_subaccount_created_at')
      .eq('user_id', user.id)
      .single();

    if (error || !data || !data.twilio_subaccount_sid) {
      return NextResponse.json({
        hasSubaccount: false,
      });
    }

    return NextResponse.json({
      hasSubaccount: true,
      subaccountSid: data.twilio_subaccount_sid,
      status: data.twilio_subaccount_status,
      friendlyName: data.twilio_subaccount_friendly_name,
      createdAt: data.twilio_subaccount_created_at,
    });
  } catch (error) {
    console.error('Error checking subaccount status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

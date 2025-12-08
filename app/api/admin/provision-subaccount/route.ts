// Manual Twilio Subaccount Provisioning Endpoint
// For manually creating subaccounts for users who paid but didn't get one

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createTwilioSubaccount } from '@/lib/twilioSubaccounts';
import { timingSafeEqual } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Timing-safe comparison for secrets to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // If lengths differ, still perform comparison to avoid timing leak
    if (bufA.length !== bufB.length) {
      // Compare bufA with itself to maintain constant time
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin secret using timing-safe comparison
    const authHeader = req.headers.get('authorization');
    const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;

    if (!adminSecret) {
      console.error('❌ Admin secret not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const providedToken = authHeader?.replace('Bearer ', '') || '';

    if (!secureCompare(providedToken, adminSecret)) {
      console.error('❌ Unauthorized admin request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    console.log(`📱 Manually provisioning Twilio subaccount for user ${userId}...`);

    // Get user details
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userData.user) {
      console.error('❌ Error fetching user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userEmail = userData.user.email || '';
    const userName = userData.user.user_metadata?.full_name || '';

    console.log(`👤 User: ${userName} (${userEmail})`);

    // Check if user already has a subaccount
    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status')
      .eq('user_id', userId)
      .single();

    if (prefData?.twilio_subaccount_sid && prefData.twilio_subaccount_status === 'active') {
      console.log(`✅ User already has an active subaccount: ${prefData.twilio_subaccount_sid}`);
      return NextResponse.json({
        success: true,
        message: 'User already has an active subaccount',
        subaccountSid: prefData.twilio_subaccount_sid,
      });
    }

    // Create Twilio subaccount
    const subaccountResult = await createTwilioSubaccount({
      userId,
      userEmail,
      userName,
    });

    if (!subaccountResult.success) {
      console.error('❌ Failed to create subaccount:', subaccountResult.error);
      return NextResponse.json(
        { error: subaccountResult.error || 'Failed to create subaccount' },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully created Twilio subaccount: ${subaccountResult.subaccountSid}`);

    return NextResponse.json({
      success: true,
      subaccountSid: subaccountResult.subaccountSid,
      friendlyName: subaccountResult.friendlyName,
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Route: Purchase Phone Number from Telnyx
// Orders local or toll-free numbers via Telnyx API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isTollFreeNumber, getVerifiedTollFreeNumbers } from '@/lib/telnyx';

// Admin client to bypass RLS for database operations
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
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

    const { phoneNumber, connectionId } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

    console.log('📱 Purchase number request:', {
      phoneNumber,
      messagingProfileId: messagingProfileId ? `${messagingProfileId.substring(0, 8)}...` : 'MISSING',
      hasApiKey: !!apiKey
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Telnyx API key not configured' },
        { status: 500 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check if number is already owned by someone
    const { data: existingNumber } = await supabaseAdmin
      .from('user_telnyx_numbers')
      .select('id, user_id')
      .eq('phone_number', phoneNumber)
      .single();

    if (existingNumber) {
      if (existingNumber.user_id === user.id) {
        return NextResponse.json(
          { error: 'You already own this number' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'This number is already owned by another user' },
        { status: 400 }
      );
    }

    // Block purchase of unverified toll-free numbers
    if (isTollFreeNumber(phoneNumber)) {
      const verifiedNumbers = await getVerifiedTollFreeNumbers();
      if (!verifiedNumbers.has(phoneNumber)) {
        return NextResponse.json(
          { error: 'This toll-free number is not verified for messaging. Please choose a verified number from the available pool.' },
          { status: 400 }
        );
      }
    }

    // Create number order via Telnyx API
    const orderResponse = await fetch('https://api.telnyx.com/v2/number_orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phone_numbers: [{ phone_number: phoneNumber }],
        connection_id: connectionId || undefined,
        messaging_profile_id: messagingProfileId,
        customer_reference: user.id, // Pass user_id for webhook to identify owner
      }),
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error('Telnyx order error:', JSON.stringify(orderData, null, 2));
      console.error('Request body was:', JSON.stringify({
        phone_numbers: [{ phone_number: phoneNumber }],
        messaging_profile_id: messagingProfileId,
      }, null, 2));
      return NextResponse.json(
        { error: orderData.errors?.[0]?.detail || 'Failed to order phone number' },
        { status: orderResponse.status }
      );
    }

    console.log('✅ Telnyx number order created:', {
      orderId: orderData.data?.id,
      phoneNumber,
      userId: user.id,
    });

    // Create pending record in database using admin client (bypasses RLS)
    // This will be updated to 'active' when webhook confirms provisioning
    const { error: dbError } = await supabaseAdmin
      .from('user_telnyx_numbers')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        friendly_name: phoneNumber,
        status: 'pending', // Pending until webhook confirms
        messaging_profile_id: messagingProfileId,
      });

    if (dbError) {
      console.error('Error saving pending number:', dbError);
      return NextResponse.json(
        { error: 'Failed to save number to database: ' + dbError.message },
        { status: 500 }
      );
    }

    // For toll-free numbers, they're usually available immediately
    // For local numbers, may need to wait for provisioning
    const isTollFree = phoneNumber.startsWith('+1800') ||
                       phoneNumber.startsWith('+1888') ||
                       phoneNumber.startsWith('+1877') ||
                       phoneNumber.startsWith('+1866') ||
                       phoneNumber.startsWith('+1855') ||
                       phoneNumber.startsWith('+1844') ||
                       phoneNumber.startsWith('+1833');

    // Toll-free numbers are instant - activate immediately
    if (isTollFree) {
      await supabaseAdmin
        .from('user_telnyx_numbers')
        .update({ status: 'active' })
        .eq('user_id', user.id)
        .eq('phone_number', phoneNumber);
    }

    return NextResponse.json({
      success: true,
      orderId: orderData.data?.id,
      phoneNumber,
      status: orderData.data?.status || 'pending',
      message: isTollFree
        ? 'Toll-free number ordered! It should be ready shortly.'
        : 'Local number ordered! It will be ready once provisioning completes (usually within a few minutes).',
      requiresProvisioning: !isTollFree,
    });

  } catch (error: any) {
    console.error('Purchase number error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Route: Release/Delete Phone Number from Telnyx

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Verify the user owns this number
    const { data: numberRecord, error: lookupError } = await supabase
      .from('user_telnyx_numbers')
      .select('id, phone_number, telnyx_connection_id')
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id)
      .single();

    if (lookupError || !numberRecord) {
      return NextResponse.json(
        { error: 'Phone number not found or you do not own it' },
        { status: 404 }
      );
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Telnyx API key not configured' }, { status: 500 });
    }

    // Delete the number via Telnyx API
    // First, find the phone number ID from Telnyx
    const listResponse = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const listData = await listResponse.json();
    const telnyxNumber = listData.data?.[0];

    if (telnyxNumber?.id) {
      // Delete the number from Telnyx
      const deleteResponse = await fetch(
        `https://api.telnyx.com/v2/phone_numbers/${telnyxNumber.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 204 && deleteResponse.status !== 404) {
        const errorData = await deleteResponse.json().catch(() => ({}));
        console.error('Telnyx delete error:', errorData);
        return NextResponse.json(
          { error: errorData.errors?.[0]?.detail || 'Failed to release number from Telnyx' },
          { status: deleteResponse.status }
        );
      }
    }

    // Remove from database
    const { error: dbError } = await supabase
      .from('user_telnyx_numbers')
      .delete()
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Error deleting number from database:', dbError);
      // Continue - number was released from Telnyx
    }

    // Also check if it was from the pool and mark it available again
    await supabase
      .from('number_pool')
      .update({
        is_assigned: false,
        assigned_to_user_id: null,
        assigned_at: null,
      })
      .eq('phone_number', phoneNumber);

    console.log('Released phone number:', phoneNumber, 'for user:', user.id);

    return NextResponse.json({
      success: true,
      message: 'Phone number released successfully',
    });
  } catch (error: any) {
    console.error('Phone number release error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

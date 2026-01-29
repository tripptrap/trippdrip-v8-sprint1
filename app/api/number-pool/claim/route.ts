// API Route: Claim a number from the pool
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { numberId } = await req.json();

    if (!numberId) {
      return NextResponse.json(
        { error: 'Number ID is required' },
        { status: 400 }
      );
    }

    // Check if user already has a number from the pool
    const { data: existingAssignment } = await supabase
      .from('number_pool')
      .select('*')
      .eq('assigned_to_user_id', user.id)
      .single();

    if (existingAssignment) {
      return NextResponse.json(
        {
          error: 'You already have a shared number assigned',
          assignedNumber: existingAssignment
        },
        { status: 400 }
      );
    }

    // Get the number and verify it's available
    const { data: poolNumber, error: fetchError } = await supabase
      .from('number_pool')
      .select('*')
      .eq('id', numberId)
      .eq('is_assigned', false)
      .eq('is_verified', true)
      .single();

    if (fetchError || !poolNumber) {
      return NextResponse.json(
        { error: 'Number not available or already claimed' },
        { status: 404 }
      );
    }

    // Assign the number to the user
    const { data: updatedNumber, error: updateError } = await supabase
      .from('number_pool')
      .update({
        is_assigned: true,
        assigned_to_user_id: user.id,
        assigned_at: new Date().toISOString()
      })
      .eq('id', numberId)
      .eq('is_assigned', false) // Double-check it's still unassigned
      .select()
      .single();

    if (updateError || !updatedNumber) {
      console.error('Error claiming number:', updateError);
      return NextResponse.json(
        { error: 'Failed to claim number. It may have been claimed by another user.' },
        { status: 500 }
      );
    }

    // Add to user_telnyx_numbers table (primary ownership table)
    // This ensures the user owns the number and can use it for sending
    const { error: telnyxNumberError } = await supabase
      .from('user_telnyx_numbers')
      .insert({
        user_id: user.id,
        phone_number: poolNumber.phone_number,
        friendly_name: poolNumber.friendly_name || `Shared ${poolNumber.number_type}`,
        status: 'active',
      });

    if (telnyxNumberError) {
      console.error('Error adding to user_telnyx_numbers:', telnyxNumberError);
      // Rollback the pool assignment
      await supabase
        .from('number_pool')
        .update({
          is_assigned: false,
          assigned_to_user_id: null,
          assigned_at: null
        })
        .eq('id', numberId);

      return NextResponse.json(
        { error: 'Failed to assign number to your account. Number may already be owned by another user.' },
        { status: 500 }
      );
    }

    // Also add to user_twilio_numbers table for backward compatibility
    const { error: twilioError } = await supabase
      .from('user_twilio_numbers')
      .insert({
        user_id: user.id,
        phone_number: poolNumber.phone_number,
        phone_sid: poolNumber.phone_sid,
        friendly_name: poolNumber.friendly_name || `Shared ${poolNumber.number_type}`,
        capabilities: poolNumber.capabilities,
        is_primary: false,
        status: 'active',
        is_from_pool: true,
        pool_number_id: poolNumber.id
      });

    if (twilioError) {
      console.log('Note: user_twilio_numbers insert skipped:', twilioError.message);
    }

    console.log(`✅ Number ${poolNumber.phone_number} claimed by user ${user.id}`);

    return NextResponse.json({
      success: true,
      number: updatedNumber,
      message: `Successfully claimed ${poolNumber.phone_number}! You can start sending messages immediately.`
    });

  } catch (error: any) {
    console.error('Claim number error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

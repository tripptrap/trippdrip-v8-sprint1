// API Route: Purchase a phone number using credits

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CREDITS_PER_NUMBER = 100; // 100 credits/month for a phone number

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { phoneNumber, credits } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const requiredCredits = credits || CREDITS_PER_NUMBER;

    // Get user's current credits
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user credits:', userError);
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const currentCredits = userData.credits || 0;

    if (currentCredits < requiredCredits) {
      return NextResponse.json(
        {
          error: `Insufficient credits. You have ${currentCredits} credits but need ${requiredCredits}.`,
          currentCredits,
          requiredCredits
        },
        { status: 400 }
      );
    }

    // Deduct credits
    const newCredits = currentCredits - requiredCredits;
    const { error: updateError } = await supabase
      .from('users')
      .update({ credits: newCredits })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error deducting credits:', updateError);
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // Add the number to user's account
    const { error: numberError } = await supabase
      .from('user_telnyx_numbers')
      .upsert({
        user_id: user.id,
        phone_number: phoneNumber,
        status: 'active',
        payment_method: 'credits',
        credits_charged: requiredCredits,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
      }, {
        onConflict: 'user_id,phone_number'
      });

    if (numberError) {
      // Rollback credits
      await supabase
        .from('users')
        .update({ credits: currentCredits })
        .eq('id', user.id);

      console.error('Error adding number:', numberError);
      return NextResponse.json(
        { error: 'Failed to add number. Credits have been refunded.' },
        { status: 500 }
      );
    }

    // Log the transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: user.id,
        amount: -requiredCredits,
        type: 'phone_number_purchase',
        description: `Phone number: ${phoneNumber}`,
        metadata: { phone_number: phoneNumber }
      });

    console.log(`✅ User ${user.id} purchased number ${phoneNumber} with ${requiredCredits} credits`);

    return NextResponse.json({
      success: true,
      message: `Successfully purchased ${phoneNumber} with ${requiredCredits} credits`,
      newBalance: newCredits,
      phone_number: phoneNumber
    });

  } catch (error: any) {
    console.error('Purchase with credits error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

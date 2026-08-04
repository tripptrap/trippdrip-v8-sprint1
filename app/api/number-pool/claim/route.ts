// API Route: Claim a number from the pool
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkNumberEligibility } from '@/lib/numberEligibility';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isTollFreeNumber, getVerifiedTollFreeNumbers } from '@/lib/telnyx';
import { evaluateClaim } from '@/lib/numberPool';

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

    // Carriers require a registered business behind any number that sends A2P
    // traffic, so a number handed out before registration cannot actually send
    // — it just looks like it can (#1). Fails closed: without the service-role
    // client the gate cannot be evaluated, and "cannot check" must not mean
    // "allow".
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server not configured (missing service role key)' },
        { status: 500 }
      );
    }
    // Pool numbers are toll-free, which is authorised by Toll-Free Verification
    // rather than 10DLC — so the registration gate does not apply to them, and
    // applying it withheld a number for a reason that was not about that number.
    // A new account can claim and send immediately, under the provisional cap in
    // lib/numberEligibility. See the header there.
    const gate = await checkNumberEligibility(supabaseAdmin, user.id, { numberType: 'tollfree' });
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason, code: gate.code, registrationRequired: true },
        { status: 403 }
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

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get the number and verify it's available (use admin to bypass RLS)
    const { data: poolNumber, error: fetchError } = await supabaseAdmin
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

    // Confirm verification against Telnyx, not just the DB flag (#36).
    // `number_pool.is_verified` is written once by a seed migration and never
    // reconciled, so it can't notice a verification being rejected, revoked, or
    // lost (this account has already lost numbers to an account deactivation).
    // Handing out a number the carrier no longer considers verified fails
    // silently — messages get filtered and it reads as "SMS is flaky".
    if (isTollFreeNumber(poolNumber.phone_number)) {
      const verified = await getVerifiedTollFreeNumbers();
      if (!verified.has(poolNumber.phone_number)) {
        console.error(
          `❌ Pool number ${poolNumber.phone_number} is marked is_verified in the DB but is NOT verified with Telnyx — refusing to assign it to user ${user.id}.`
        );

        // Correct the stale flag so it stops being offered to anyone else.
        await supabaseAdmin
          .from('number_pool')
          .update({ is_verified: false })
          .eq('id', numberId);

        return NextResponse.json(
          { error: 'That number is not currently verified for messaging. Please choose another.' },
          { status: 409 }
        );
      }
    }

    // Reputation follows the number, not the tenant, so a number that has just
    // come back from another business does not go straight out again (#38).
    // This also refuses outright any number with real carrier spam history, and
    // yields the cooldown when the pool has nothing else rather than blocking
    // someone's signup.
    const decision = await evaluateClaim(supabaseAdmin, poolNumber);
    if (!decision.allow) {
      return NextResponse.json({ error: decision.message }, { status: decision.status });
    }

    // Assign the number to the user
    const { data: updatedNumber, error: updateError } = await supabaseAdmin
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
    const { error: telnyxNumberError } = await supabaseAdmin
      .from('user_telnyx_numbers')
      .insert({
        user_id: user.id,
        phone_number: poolNumber.phone_number,
        friendly_name: poolNumber.friendly_name || `Shared ${poolNumber.number_type}`,
        status: 'active',
        capabilities: poolNumber.capabilities || { voice: true, sms: true, mms: true },
      });

    if (telnyxNumberError) {
      console.error('Error adding to user_telnyx_numbers:', telnyxNumberError);
      // Rollback the pool assignment
      await supabaseAdmin
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

    // Open the assignment-history row. Deliberately after the ownership writes
    // succeed, so history records tenancies that actually happened.
    const { error: historyError } = await supabaseAdmin
      .rpc('record_pool_assignment', { p_phone_number: poolNumber.phone_number, p_user_id: user.id });
    if (historyError) {
      // Non-fatal: the user has their number. But the gap matters later, so say so.
      console.error(`Failed to record pool assignment history for ${poolNumber.phone_number}:`, historyError);
    }

    console.log(
      `✅ Number ${poolNumber.phone_number} claimed by user ${user.id}` +
        (decision.recycled ? ' (recycled from an exhausted pool — see #38)' : '')
    );

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

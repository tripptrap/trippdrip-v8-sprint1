import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { amount, description, leadId, messageId, campaignId } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid amount' }, { status: 400 });
    }

    // Get current balance
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user credits:', userError);
      return NextResponse.json({ ok: false, error: userError.message }, { status: 500 });
    }

    const currentBalance = userData?.credits || 0;

    if (currentBalance < amount) {
      return NextResponse.json({ ok: false, error: 'Insufficient credits' }, { status: 400 });
    }

    // Deduct points
    const newBalance = currentBalance - amount;
    const { error: updateError } = await supabase
      .from('users')
      .update({ credits: newBalance })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Create transaction record
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        action_type: 'spend',
        points_amount: -amount,
        description: description || 'Points spent',
        lead_id: leadId || null,
        message_id: messageId || null,
        campaign_id: campaignId || null
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      // Don't fail the whole operation if transaction logging fails
    }

    // Dispatch event for UI updates
    return NextResponse.json({ 
      ok: true, 
      balance: newBalance,
      transaction 
    });
  } catch (error: any) {
    console.error('Error in POST /api/points/spend:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
